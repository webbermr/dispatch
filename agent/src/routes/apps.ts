import { Router } from 'express'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { loadConfig, saveConfig } from '../config.js'
import { diagnoseRepo } from '../lib/diagnostics.js'
import { aheadBehind, clone, cloneUrl, currentBranch, getRemoteUrl, isClean, isGitRepo, listBranches, parseCloneTarget, run } from '../lib/git.js'
import { forgeOfUrl } from '../lib/forge.js'
import { ghAuthed, ghCreateRepo, ghInstalled } from '../lib/gh.js'
import { bus } from '../lib/events.js'
import { isPathContained } from '../lib/paths.js'
import { log } from '../lib/log.js'
import { registerRepo } from '../lib/registry.js'
import { repoChat } from '../repoChat.js'
import { runManager } from '../runManager.js'
import type { AppRecord, AppStatus } from '../types.js'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'new-app'
}

function expandDir(dir: string): string {
  let p = dir.trim()
  if (p === '~' || p.startsWith('~/')) p = join(homedir(), p.slice(1))
  return resolve(p)
}

/** Create a fresh local git repo (dir + git init + README + initial commit). */
async function initLocalRepo(dest: string, displayName: string): Promise<void> {
  mkdirSync(dest, { recursive: true })
  const init = await run('git', ['init'], { cwd: dest })
  if (init.code !== 0) throw new Error(`git init failed: ${init.stderr.trim()}`)
  writeFileSync(join(dest, 'README.md'), `# ${displayName}\n`)
  await run('git', ['add', '-A'], { cwd: dest })
  const commit = await run('git', ['-c', 'user.email=dispatch@local', '-c', 'user.name=Dispatch', 'commit', '-m', 'Initial commit'], { cwd: dest })
  if (commit.code !== 0) throw new Error(`initial commit failed: ${commit.stderr.trim()}`)
}

async function statusFor(app: AppRecord): Promise<AppStatus> {
  const cloned = await isGitRepo(app.localPath)
  if (!cloned) {
    return { ...app, cloned: false, clean: false, currentBranch: null, ahead: 0, behind: 0, hasRemote: false, forge: 'other', branches: [] }
  }
  const [clean, branch, ab, remote, branches] = await Promise.all([
    isClean(app.localPath),
    currentBranch(app.localPath),
    aheadBehind(app.localPath),
    getRemoteUrl(app.localPath),
    listBranches(app.localPath),
  ])
  return { ...app, cloned: true, clean, currentBranch: branch, ahead: ab.ahead, behind: ab.behind, hasRemote: !!remote, forge: forgeOfUrl(remote), branches }
}

export function appsRouter(): Router {
  const r = Router()

  // GET /apps — registered repos + live git status (spec §5).
  r.get('/apps', async (_req, res) => {
    const cfg = loadConfig()
    const apps = await Promise.all(cfg.apps.map(statusFor))
    // Backfill a merge strategy for older apps that predate the per-app setting:
    // open PRs when the repo has a remote, otherwise merge locally.
    let changed = false
    for (const s of apps) {
      const rec = cfg.apps.find((a) => a.id === s.id)
      if (!rec) continue
      if (!rec.mergeStrategy) {
        rec.mergeStrategy = s.hasRemote ? 'pr' : 'merge'
        s.mergeStrategy = rec.mergeStrategy
        changed = true
      }
      if (!rec.buildLocation) {
        rec.buildLocation = 'worktree'
        s.buildLocation = rec.buildLocation
        changed = true
      }
      if (!rec.agent) {
        rec.agent = 'codex'
        s.agent = rec.agent
        changed = true
      }
      if (!rec.repoMode) {
        rec.repoMode = s.hasRemote ? 'remote' : 'local'
        s.repoMode = rec.repoMode
        changed = true
      }
    }
    if (changed) saveConfig(cfg)
    res.json({ apps })
  })

  // GET /apps/:id — single app status (pre-flight gate before dispatch).
  r.get('/apps/:id', async (req, res) => {
    const app = loadConfig().apps.find((a) => a.id === req.params.id)
    if (!app) return res.status(404).json({ error: 'unknown app' })
    res.json(await statusFor(app))
  })

  // POST /apps/diagnose — check a path's git/remote readiness without registering it.
  r.post('/apps/diagnose', async (req, res) => {
    const { localPath } = req.body ?? {}
    if (!localPath || typeof localPath !== 'string') return res.status(400).json({ error: 'localPath is required' })
    res.json(await diagnoseRepo(localPath))
  })

  // POST /apps — register a local git repo { localPath, name?, repoSlug?, defaultBranch?, repoMode? }.
  r.post('/apps', async (req, res) => {
    const { name, localPath, repoSlug, defaultBranch, repoMode } = req.body ?? {}
    if (!localPath || typeof localPath !== 'string') return res.status(400).json({ error: 'localPath is required' })
    try {
      const app = await registerRepo({ localPath, name, repoSlug, defaultBranch, repoMode: repoMode === 'local' || repoMode === 'remote' ? repoMode : undefined })
      log.info('registered app', app.id, app.name, app.localPath)
      res.status(201).json(await statusFor(app))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /apps/clone-url — clone a brand-new repo from a URL, then register it.
  r.post('/apps/clone-url', async (req, res) => {
    const { repoUrl, parentDir, name } = req.body ?? {}
    if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) return res.status(400).json({ error: 'repoUrl is required' })
    if (!parentDir || typeof parentDir !== 'string' || !parentDir.trim()) return res.status(400).json({ error: 'a destination folder is required' })
    const { url, name: repoName } = parseCloneTarget(repoUrl)
    let parent = parentDir.trim()
    if (parent === '~' || parent.startsWith('~/')) parent = join(homedir(), parent.slice(1))
    parent = resolve(parent)
    const dest = join(parent, repoName)
    if (existsSync(dest) && readdirSync(dest).length) {
      return res.status(400).json({ error: `a non-empty folder already exists at ${dest}` })
    }
    try {
      mkdirSync(parent, { recursive: true })
    } catch (err) {
      return res.status(400).json({ error: `couldn't create ${parent}: ${(err as Error).message}` })
    }
    // The user explicitly chose this destination → approve its parent as a root.
    const cfg = loadConfig()
    if (!cfg.roots.includes(parent)) {
      cfg.roots.push(parent)
      saveConfig(cfg)
    }
    const code = await cloneUrl(url, dest, (line) => bus.publish({ type: 'run.log', runId: 'clone_new', line, stream: 'stderr' }))
    if (code !== 0) {
      // Remove any partial checkout so a retry starts clean.
      try {
        if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
      return res.status(400).json({ error: 'clone failed — check the URL and that you have access (SSH key / gh auth)' })
    }
    try {
      const app = await registerRepo({ localPath: dest, name: typeof name === 'string' ? name : undefined, repoMode: 'remote' })
      log.info('cloned + registered app', app.id, app.name, app.localPath)
      res.status(201).json(await statusFor(app))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /apps/init-local — create a brand-new local-only repo and register it.
  r.post('/apps/init-local', async (req, res) => {
    const { parentDir, slug, name } = req.body ?? {}
    if (!parentDir || typeof parentDir !== 'string' || !parentDir.trim()) return res.status(400).json({ error: 'a destination folder is required' })
    const folder = slugify((typeof slug === 'string' && slug.trim()) || (typeof name === 'string' ? name : '') || 'new-app')
    const parent = expandDir(parentDir)
    const dest = join(parent, folder)
    if (existsSync(dest) && readdirSync(dest).length) return res.status(400).json({ error: `a non-empty folder already exists at ${dest}` })
    const cfg = loadConfig()
    if (!cfg.roots.includes(parent)) {
      cfg.roots.push(parent)
      saveConfig(cfg)
    }
    try {
      await initLocalRepo(dest, typeof name === 'string' && name.trim() ? name.trim() : folder)
      const app = await registerRepo({ localPath: dest, name: typeof name === 'string' ? name : undefined, repoMode: 'local' })
      log.info('created local repo + app', app.id, app.name, app.localPath)
      res.status(201).json(await statusFor(app))
    } catch (err) {
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /apps/create-remote — create a new local repo, publish it to GitHub, register it.
  r.post('/apps/create-remote', async (req, res) => {
    const { parentDir, slug, name, private: priv } = req.body ?? {}
    if (!parentDir || typeof parentDir !== 'string' || !parentDir.trim()) return res.status(400).json({ error: 'a destination folder is required' })
    if (!(await ghInstalled())) return res.status(400).json({ error: 'GitHub CLI (gh) not found — install gh, or use a local repo' })
    if (!(await ghAuthed())) return res.status(400).json({ error: 'GitHub CLI isn’t signed in — run `gh auth login` in a terminal' })
    const folder = slugify((typeof slug === 'string' && slug.trim()) || (typeof name === 'string' ? name : '') || 'new-app')
    const parent = expandDir(parentDir)
    const dest = join(parent, folder)
    if (existsSync(dest) && readdirSync(dest).length) return res.status(400).json({ error: `a non-empty folder already exists at ${dest}` })
    const cfg = loadConfig()
    if (!cfg.roots.includes(parent)) {
      cfg.roots.push(parent)
      saveConfig(cfg)
    }
    try {
      await initLocalRepo(dest, typeof name === 'string' && name.trim() ? name.trim() : folder)
      const created = await ghCreateRepo(dest, folder, priv === false ? 'public' : 'private')
      if (!created.ok) throw new Error(created.error)
      const app = await registerRepo({ localPath: dest, name: typeof name === 'string' ? name : undefined, repoMode: 'remote' })
      log.info('created remote repo + app', app.id, app.name, created.url)
      res.status(201).json(await statusFor(app))
    } catch (err) {
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /apps/:id/clone — clone repoSlug → localPath, streaming progress (spec §5).
  r.post('/apps/:id/clone', async (req, res) => {
    const cfg = loadConfig()
    const app = cfg.apps.find((a) => a.id === req.params.id)
    if (!app) return res.status(404).json({ error: 'unknown app' })
    if (!app.repoSlug) return res.status(400).json({ error: 'app has no repoSlug to clone from' })
    if (await isGitRepo(app.localPath)) return res.status(409).json({ error: 'already cloned' })
    if (!isPathContained(app.localPath, cfg.roots)) {
      return res.status(403).json({ error: 'localPath escapes approved roots' })
    }

    const runId = `clone_${app.id}`
    const code = await clone(app.repoSlug, app.localPath, (line) => {
      bus.publish({ type: 'run.log', runId, line, stream: 'stderr' })
    })
    if (code !== 0) return res.status(500).json({ error: 'clone failed', code })
    res.json(await statusFor(app))
  })

  // PATCH /apps/:id — update editable app settings (merge strategy, name).
  r.patch('/apps/:id', async (req, res) => {
    const cfg = loadConfig()
    const app = cfg.apps.find((a) => a.id === req.params.id)
    if (!app) return res.status(404).json({ error: 'unknown app' })
    const { mergeStrategy, buildLocation, agent, name, planFirst, autoRetry, previewCommand, repoMode } = req.body ?? {}
    if (mergeStrategy === 'pr' || mergeStrategy === 'merge') app.mergeStrategy = mergeStrategy
    // Switching Local/Remote also flips the default merge behavior to a sensible match.
    if (repoMode === 'local' || repoMode === 'remote') {
      app.repoMode = repoMode
      if (mergeStrategy === undefined) app.mergeStrategy = repoMode === 'remote' ? 'pr' : 'merge'
    }
    if (buildLocation === 'worktree' || buildLocation === 'workdir') app.buildLocation = buildLocation
    if (agent === 'codex' || agent === 'claude') app.agent = agent
    if (typeof planFirst === 'boolean') app.planFirst = planFirst
    if (typeof autoRetry === 'boolean') app.autoRetry = autoRetry
    if (typeof previewCommand === 'string') app.previewCommand = previewCommand.trim() || undefined
    if (typeof name === 'string' && name.trim()) app.name = name.trim()
    saveConfig(cfg)
    res.json(await statusFor(app))
  })

  // POST /apps/:id/archive-merged — archive all shipped cards in an app.
  r.post('/apps/:id/archive-merged', (req, res) => {
    if (!loadConfig().apps.some((a) => a.id === req.params.id)) return res.status(404).json({ error: 'unknown app' })
    res.json(runManager.archiveMerged(req.params.id))
  })

  // GET /apps/:id/chat — the repo Q&A transcript (for initial load).
  r.get('/apps/:id/chat', (req, res) => {
    res.json(repoChat.transcript(req.params.id))
  })

  // POST /apps/:id/ask — ask a question about the repo (answer streams over WS).
  r.post('/apps/:id/ask', (req, res) => {
    const text = (req.body?.text ?? '').toString().trim()
    if (!text) return res.status(400).json({ error: 'text is required' })
    try {
      repoChat.ask(req.params.id, text)
      res.status(202).json({ ok: true })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /apps/:id/chat/clear — reset the repo chat transcript + session.
  r.post('/apps/:id/chat/clear', (req, res) => {
    repoChat.clear(req.params.id)
    res.json({ ok: true })
  })

  // POST /apps/:id/agents-md — scan the repo and (over)write AGENTS.md.
  r.post('/apps/:id/agents-md', async (req, res) => {
    const app = loadConfig().apps.find((a) => a.id === req.params.id)
    if (!app) return res.status(404).json({ error: 'unknown app' })
    if (!(await isGitRepo(app.localPath))) return res.status(400).json({ error: 'clone the repo first' })
    const force = !!req.body?.force
    if (existsSync(join(app.localPath, 'AGENTS.md')) && !force) {
      return res.status(409).json({ error: 'AGENTS.md already exists', exists: true })
    }
    try {
      res.json(await runManager.generateAgentsMd(app.id, force))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /apps/:id/pull — fast-forward the local checkout from its remote.
  r.post('/apps/:id/pull', async (req, res) => {
    const app = loadConfig().apps.find((a) => a.id === req.params.id)
    if (!app) return res.status(404).json({ error: 'unknown app' })
    if (!(await isGitRepo(app.localPath))) return res.status(400).json({ error: 'repo is not cloned' })
    if (!(await getRemoteUrl(app.localPath))) return res.status(400).json({ error: 'this repo has no git remote to pull from' })
    const r2 = await run('git', ['pull', '--ff-only'], {
      cwd: app.localPath,
      timeoutMs: 30000,
      env: { GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new -oConnectTimeout=8' },
    })
    const out = `${r2.stdout}\n${r2.stderr}`.trim()
    if (r2.code !== 0) {
      return res.status(400).json({ error: out.split('\n').filter(Boolean).slice(-2).join(' ') || `git pull exited ${r2.code}` })
    }
    const summary = out.split('\n').map((l) => l.trim()).find((l) => l) ?? 'Up to date.'
    res.json({ summary, status: await statusFor(app) })
  })

  // DELETE /apps/:id — unregister a repo and drop its cards/runs (worktrees cleaned).
  // Never deletes the user's actual repo on disk, just Dispatch's record of it.
  r.delete('/apps/:id', async (req, res) => {
    const cfg = loadConfig()
    const app = cfg.apps.find((a) => a.id === req.params.id)
    if (!app) return res.status(404).json({ error: 'unknown app' })
    try {
      await runManager.removeAppData(app.id, app.localPath)
      cfg.apps = cfg.apps.filter((a) => a.id !== app.id)
      saveConfig(cfg)
      bus.publish({ type: 'app.remove', appId: app.id })
      log.info('removed app', app.id, app.name)
      res.status(204).end()
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  return r
}
