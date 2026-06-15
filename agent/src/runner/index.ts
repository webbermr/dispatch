import { hostname } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { loadConfig, WORKTREES_DIR } from '../config.js'
import { getAgent, probeAgents } from '../lib/agentRegistry.js'
import { parseUnifiedDiff } from '../lib/diff.js'
import { addWorktree, branchExists, captureDiff, commitAll, getRemoteUrl, hasStagedOrUnstagedChanges, removeWorktree, resolveBaseBranch, run as execCmd } from '../lib/git.js'
import { createPullRequest, forgeOfUrl, forgeReady } from '../lib/forge.js'
import { log } from '../lib/log.js'
import type { CardType, CodingAgentId } from '../types.js'

interface BuiltRun {
  localPath: string
  worktreePath: string
  branch: string
  baseBranch: string
  title?: string
}

interface ApproveMsg {
  runId: string
  strategy: 'pr' | 'merge'
  defaultBranch: string
  title?: string
}

interface Job {
  runId: string
  repoSlug: string
  prompt: string
  title?: string
  cardType?: CardType
  baseBranch?: string
  mode?: 'plan' | 'build'
  model?: string
  agentId?: CodingAgentId
}

function branchFor(title: string | undefined, type: CardType | undefined): string {
  const prefix = type === 'bug' ? 'fix' : type === 'enhancement' ? 'enh' : 'feat'
  const slug = (title ?? 'change').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'change'
  return `${prefix}/${slug}`
}

/** Connect this machine to a control-plane server as a build runner. */
export function startRunner(serverUrl: string, token: string): void {
  const wsUrl = `${serverUrl.replace(/\/$/, '').replace(/^http/, 'ws')}/runner?token=${encodeURIComponent(token)}`
  let ws: WebSocket | null = null
  const active = new Set<string>()
  const built = new Map<string, BuiltRun>() // runId → worktree context for approve

  const connect = () => {
    log.info('runner connecting to', serverUrl)
    ws = new WebSocket(wsUrl)

    ws.on('open', async () => {
      const apps = loadConfig().apps.filter((a) => a.repoSlug)
      const agents = (await probeAgents()).filter((a) => a.installed).map((a) => ({ id: a.id, models: a.models }))
      ws!.send(JSON.stringify({ type: 'register', name: hostname(), repos: apps.map((a) => a.repoSlug), agents }))
      log.info(`runner registered ${apps.length} repo(s): ${apps.map((a) => a.repoSlug).join(', ') || '(none — clone/register a repo)'}`)
    })

    ws.on('message', (data) => {
      let msg: { type?: string } & Partial<Job>
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (msg.type === 'job' && msg.runId && msg.repoSlug) void runJob(msg as Job)
      else if (msg.type === 'approve' && msg.runId) void approveJob(msg as unknown as ApproveMsg)
    })

    ws.on('close', () => {
      log.warn('runner disconnected — retrying in 5s')
      setTimeout(connect, 5000)
    })
    ws.on('error', (e) => log.warn('runner socket error', String(e)))
  }

  const emit = (runId: string, event: Record<string, unknown>) => {
    if (ws?.readyState === ws?.OPEN) ws?.send(JSON.stringify({ type: 'run.event', runId, event }))
  }

  const runJob = async (job: Job) => {
    if (active.has(job.runId)) return
    active.add(job.runId)
    const app = loadConfig().apps.find((a) => a.repoSlug === job.repoSlug)
    if (!app) {
      emit(job.runId, { kind: 'error', error: `this machine has no clone of ${job.repoSlug}` })
      emit(job.runId, { kind: 'status', status: 'failed' })
      active.delete(job.runId)
      return
    }
    try {
      const baseBranch = await resolveBaseBranch(app.localPath, job.baseBranch || app.defaultBranch)
      let branch = branchFor(job.title, job.cardType)
      for (let n = 1; await branchExists(app.localPath, branch); n++) branch = `${branchFor(job.title, job.cardType)}-${n}`
      const worktreePath = join(WORKTREES_DIR, job.runId)
      const wt = await addWorktree(app.localPath, worktreePath, branch, baseBranch)
      if (wt.code !== 0) throw new Error(`worktree add failed: ${wt.stderr.trim()}`)
      emit(job.runId, { kind: 'branch', branch })
      emit(job.runId, { kind: 'step', step: 'cloning', state: 'done' })

      let last: string | undefined
      const agentId: CodingAgentId = job.agentId === 'claude' || job.agentId === 'codex' ? job.agentId : app.agent ?? 'codex'
      getAgent(agentId).run(
        { worktreePath, prompt: job.prompt, mode: job.mode === 'plan' ? 'plan' : 'build', model: job.model },
        {
          onLog: (line) => emit(job.runId, { kind: 'log', line }),
          onStep: (step, state) => emit(job.runId, { kind: 'step', step, state }),
          onProgress: (pct) => emit(job.runId, { kind: 'progress', pct }),
          onMessage: (text) => {
            last = text
          },
          onExit: async (code) => {
            if (code !== 0) {
              emit(job.runId, { kind: 'error', error: `agent exited with code ${code}` })
              emit(job.runId, { kind: 'status', status: 'failed' })
              active.delete(job.runId)
              return
            }
            const files = parseUnifiedDiff(await captureDiff(worktreePath, baseBranch))
            emit(job.runId, { kind: 'diff', files })
            if (last?.trim()) emit(job.runId, { kind: 'message', text: last.trim() })
            emit(job.runId, { kind: 'step', step: 'pr', state: 'done' })
            emit(job.runId, { kind: 'progress', pct: 100 })
            built.set(job.runId, { localPath: app.localPath, worktreePath, branch, baseBranch, title: job.title })
            emit(job.runId, { kind: 'status', status: 'needs_review' })
            active.delete(job.runId)
          },
        },
      )
    } catch (err) {
      emit(job.runId, { kind: 'error', error: (err as Error).message })
      emit(job.runId, { kind: 'status', status: 'failed' })
      active.delete(job.runId)
    }
  }

  const approveJob = async (msg: ApproveMsg) => {
    const ctx = built.get(msg.runId)
    if (!ctx) {
      emit(msg.runId, { kind: 'error', error: 'this build is no longer on this machine — rebuild it, then approve' })
      return
    }
    try {
      if (await hasStagedOrUnstagedChanges(ctx.worktreePath)) await commitAll(ctx.worktreePath, msg.title || ctx.title || ctx.branch)
      if (msg.strategy === 'pr') {
        const remoteUrl = await getRemoteUrl(ctx.localPath)
        if (!remoteUrl) throw new Error('no git remote — switch this repo to Local (merge), or add a remote')
        const forge = forgeOfUrl(remoteUrl)
        const ready = await forgeReady(forge)
        if (!ready.ok) throw new Error(ready.reason)
        const base = msg.defaultBranch && msg.defaultBranch !== 'HEAD' ? msg.defaultBranch : 'main'
        // Push the base if the remote doesn't have it yet (fresh repos).
        if (!(await execCmd('git', ['ls-remote', '--heads', 'origin', base], { cwd: ctx.localPath })).stdout.trim()) {
          await execCmd('git', ['push', 'origin', base], { cwd: ctx.localPath })
        }
        const push = await execCmd('git', ['push', '-u', 'origin', ctx.branch], { cwd: ctx.worktreePath })
        if (push.code !== 0) throw new Error(`git push failed: ${push.stderr.trim().split('\n').slice(-2).join(' ')}`)
        const pr = await createPullRequest(forge, ctx.worktreePath, ctx.branch, base)
        if (!pr.ok) throw new Error(`branch pushed, but opening the PR failed: ${pr.error}`)
        emit(msg.runId, { kind: 'branch', branch: ctx.branch })
        emit(msg.runId, { kind: 'prUrl', prUrl: pr.url })
      } else {
        const co = await execCmd('git', ['checkout', msg.defaultBranch], { cwd: ctx.localPath })
        if (co.code !== 0) throw new Error(`could not checkout ${msg.defaultBranch}: ${co.stderr.trim()}`)
        const merge = await execCmd('git', ['merge', '--ff-only', ctx.branch], { cwd: ctx.localPath })
        if (merge.code !== 0) throw new Error(`fast-forward merge failed: ${merge.stderr.trim().split('\n').slice(-2).join(' ')}`)
      }
      await removeWorktree(ctx.localPath, ctx.worktreePath)
      built.delete(msg.runId)
      emit(msg.runId, { kind: 'status', status: 'merged' })
    } catch (err) {
      emit(msg.runId, { kind: 'error', error: (err as Error).message })
    }
  }

  connect()
}
