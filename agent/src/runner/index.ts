import { hostname } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { loadConfig, WORKTREES_DIR } from '../config.js'
import { getAgent, probeAgents } from '../lib/agentRegistry.js'
import { parseUnifiedDiff } from '../lib/diff.js'
import { addWorktree, branchExists, captureDiff, resolveBaseBranch } from '../lib/git.js'
import { log } from '../lib/log.js'
import type { CardType, CodingAgentId } from '../types.js'

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

  connect()
}
