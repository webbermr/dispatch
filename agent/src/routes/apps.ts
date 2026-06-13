import { Router } from 'express'
import { loadConfig, saveConfig } from '../config.js'
import { diagnoseRepo } from '../lib/diagnostics.js'
import { aheadBehind, clone, currentBranch, getRemoteUrl, isClean, isGitRepo } from '../lib/git.js'
import { bus } from '../lib/events.js'
import { isPathContained } from '../lib/paths.js'
import { log } from '../lib/log.js'
import { registerRepo } from '../lib/registry.js'
import { runManager } from '../runManager.js'
import type { AppRecord, AppStatus } from '../types.js'

async function statusFor(app: AppRecord): Promise<AppStatus> {
  const cloned = await isGitRepo(app.localPath)
  if (!cloned) {
    return { ...app, cloned: false, clean: false, currentBranch: null, ahead: 0, behind: 0, hasRemote: false }
  }
  const [clean, branch, ab, remote] = await Promise.all([
    isClean(app.localPath),
    currentBranch(app.localPath),
    aheadBehind(app.localPath),
    getRemoteUrl(app.localPath),
  ])
  return { ...app, cloned: true, clean, currentBranch: branch, ahead: ab.ahead, behind: ab.behind, hasRemote: !!remote }
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
      if (rec && !rec.mergeStrategy) {
        rec.mergeStrategy = s.hasRemote ? 'pr' : 'merge'
        s.mergeStrategy = rec.mergeStrategy
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

  // POST /apps — register a local git repo { localPath, name?, repoSlug?, defaultBranch? }.
  r.post('/apps', async (req, res) => {
    const { name, localPath, repoSlug, defaultBranch } = req.body ?? {}
    if (!localPath || typeof localPath !== 'string') return res.status(400).json({ error: 'localPath is required' })
    try {
      const app = await registerRepo({ localPath, name, repoSlug, defaultBranch })
      log.info('registered app', app.id, app.name, app.localPath)
      res.status(201).json(await statusFor(app))
    } catch (err) {
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
    const { mergeStrategy, name } = req.body ?? {}
    if (mergeStrategy === 'pr' || mergeStrategy === 'merge') app.mergeStrategy = mergeStrategy
    if (typeof name === 'string' && name.trim()) app.name = name.trim()
    saveConfig(cfg)
    res.json(await statusFor(app))
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
