import { bus } from './bus.js'
import { id } from './ids.js'
import { store } from './store/jsonStore.js'
import type { Card, Repo, Run, RunStatus, User } from './store/types.js'

const MAX_LOGS = 500

export interface ConnectedRunner {
  connId: string
  workspaceId: string
  userId: string
  name: string
  repos: string[] // advertised repo slugs
  send: (msg: unknown) => void
}

/** Run status → board column status. */
function toCardStatus(s: RunStatus): Card['status'] {
  if (s === 'needs_review') return 'review'
  if (s === 'merged') return 'merged'
  if (s === 'building') return 'building'
  return 'ready' // failed / interrupted / ready
}

class RunnerRegistry {
  private runners = new Map<string, ConnectedRunner>()

  add(r: ConnectedRunner): void {
    this.runners.set(r.connId, r)
  }
  remove(connId: string): void {
    this.runners.delete(connId)
  }
  /** A runner owned by this user, in this workspace, that advertises the repo slug. */
  findForDispatch(workspaceId: string, userId: string, slug: string): ConnectedRunner | undefined {
    for (const r of this.runners.values()) {
      if (r.workspaceId === workspaceId && r.userId === userId && r.repos.includes(slug)) return r
    }
    return undefined
  }
  byConn(connId: string): ConnectedRunner | undefined {
    return this.runners.get(connId)
  }
}

export const runners = new RunnerRegistry()

function emitRun(run: Run): void {
  bus.publish({ type: 'run.update', repoId: run.repoId, run: { id: run.id, cardId: run.cardId, status: run.status, progress: run.progress, branch: run.branch, prUrl: run.prUrl } })
}

/** Dispatch a card to the dispatcher's own runner. Throws { status, error } if none. */
export function dispatchCard(card: Card, repo: Repo, user: User): Run {
  const runner = runners.findForDispatch(repo.workspaceId, user.id, repo.repoSlug)
  if (!runner) {
    throw Object.assign(new Error(`no connected machine for "${repo.repoSlug || repo.name}". Start your agent in runner mode, with this repo cloned.`), { status: 409 })
  }
  const now = Date.now()
  const run = store.runs.insert({
    id: id('run'),
    repoId: repo.id,
    workspaceId: repo.workspaceId,
    cardId: card.id,
    userId: user.id,
    runnerName: runner.name,
    agentId: repo.settings?.agent,
    model: card.model,
    status: 'building',
    progress: 0,
    steps: [],
    logs: [],
    diff: [],
    chat: [],
    createdAt: now,
    updatedAt: now,
  })
  store.cards.update(card.id, { status: 'building', runId: run.id, updatedAt: now })
  const updatedCard = store.cards.byId(card.id)!
  bus.publish({ type: 'card.update', repoId: repo.id, card: updatedCard })
  emitRun(run)
  runner.send({
    type: 'job',
    runId: run.id,
    repoSlug: repo.repoSlug,
    repoName: repo.name,
    prompt: card.prompt,
    title: card.title,
    cardType: card.type,
    baseBranch: card.base || repo.defaultBranch,
    mode: repo.settings?.planFirst ? 'plan' : 'build',
    model: card.model,
    agentId: repo.settings?.agent,
  })
  return run
}

interface RunnerEvent {
  kind: 'status' | 'progress' | 'step' | 'log' | 'diff' | 'message' | 'branch' | 'error'
  status?: RunStatus
  pct?: number
  step?: string
  state?: 'pending' | 'active' | 'done'
  line?: string
  files?: Run['diff']
  text?: string
  branch?: string
  error?: string
}

/** Apply a runner-reported event to the stored run + the board. */
export function ingestRunnerEvent(runId: string, ev: RunnerEvent): void {
  const run = store.runs.byId(runId)
  if (!run) return
  const patch: Partial<Run> = { updatedAt: Date.now() }
  let statusChanged = false

  switch (ev.kind) {
    case 'status':
      if (ev.status) {
        patch.status = ev.status
        statusChanged = true
        if (ev.status === 'needs_review' || ev.status === 'merged') patch.progress = 100
      }
      break
    case 'progress':
      if (typeof ev.pct === 'number') patch.progress = ev.pct
      break
    case 'step':
      if (ev.step && ev.state) {
        const steps = run.steps.filter((s) => s.id !== ev.step)
        steps.push({ id: ev.step, state: ev.state })
        patch.steps = steps
      }
      break
    case 'log':
      if (ev.line) patch.logs = [...run.logs, ev.line].slice(-MAX_LOGS)
      break
    case 'diff':
      if (ev.files) patch.diff = ev.files
      break
    case 'message':
      if (ev.text) patch.chat = [...run.chat, { role: 'agent', text: ev.text, ts: Date.now() }]
      break
    case 'branch':
      if (ev.branch) patch.branch = ev.branch
      break
    case 'error':
      if (ev.error) patch.error = ev.error
      break
  }

  const updated = store.runs.update(runId, patch)!
  // Reflect status onto the linked card's column.
  if (statusChanged) {
    const card = store.cards.byId(run.cardId)
    if (card && card.runId === run.id) {
      store.cards.update(card.id, { status: toCardStatus(updated.status), updatedAt: Date.now() })
      bus.publish({ type: 'card.update', repoId: run.repoId, card: store.cards.byId(card.id)! })
    }
  }
  if (ev.kind === 'status' || ev.kind === 'progress' || ev.kind === 'branch') emitRun(updated)
}

/** Mark a runner's in-flight runs interrupted when it disconnects. */
export function interruptRunnerRuns(workspaceId: string, userId: string): void {
  for (const run of store.runs.where((r) => r.workspaceId === workspaceId && r.userId === userId && r.status === 'building')) {
    store.runs.update(run.id, { status: 'interrupted', error: 'runner disconnected', updatedAt: Date.now() })
    const card = store.cards.byId(run.cardId)
    if (card && card.runId === run.id) {
      store.cards.update(card.id, { status: 'ready', updatedAt: Date.now() })
      bus.publish({ type: 'card.update', repoId: run.repoId, card: store.cards.byId(card.id)! })
    }
    emitRun(store.runs.byId(run.id)!)
  }
}
