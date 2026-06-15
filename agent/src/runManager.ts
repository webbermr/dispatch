import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfig, loadState, saveState, WORKTREES_DIR } from './config.js'
import type { AgentController } from './lib/agents.js'
import { getAgent, probeAgents } from './lib/agentRegistry.js'
import { parseUnifiedDiff } from './lib/diff.js'
import { bus } from './lib/events.js'
import { addWorktree, branchExists, captureDiff, commitAll, getRemoteUrl, hasStagedOrUnstagedChanges, isClean, removeWorktree, resolveBaseBranch, run as execCmd } from './lib/git.js'
import { createPullRequest, forgeOfUrl, forgeReady } from './lib/forge.js'
import { ghChecks } from './lib/gh.js'
import { log } from './lib/log.js'
import type { AppRecord, CardRecord, CardStatus, CardType, ChatMessage, ChecksResult, CodingAgentId, MetricsResult, Priority, RunRecord, RunStatus, StepId, StepState } from './types.js'

const AUTO_ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000 // merged cards older than this auto-archive

const STEP_ORDER: StepId[] = ['cloning', 'planning', 'editing', 'testing', 'pr']

interface SubCardSpec {
  title: string
  prompt: string
  type: CardType
}

/** Pull a JSON array of {title, prompt, type} out of an agent's free-text reply. */
function parseDecompose(text: string): SubCardSpec[] {
  if (!text) return []
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < 0 || end < start) return []
  let arr: unknown
  try {
    arr = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const types: CardType[] = ['feature', 'bug', 'enhancement']
  return arr
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { title?: unknown }).title === 'string' && !!(x as { title: string }).title.trim())
    .slice(0, 8)
    .map((x) => ({
      title: String(x.title).trim().slice(0, 80),
      prompt: typeof x.prompt === 'string' && x.prompt.trim() ? String(x.prompt).trim() : String(x.title).trim(),
      type: types.includes(x.type as CardType) ? (x.type as CardType) : 'feature',
    }))
}

/** Strip a wrapping ```fence``` if the agent returned the whole doc inside one. */
function stripFences(t: string): string {
  const m = t.trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/)
  return m ? m[1] : t
}

function branchSlug(title: string, type: CardType): string {
  const prefix = type === 'bug' ? 'fix' : type === 'enhancement' ? 'enh' : 'feat'
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'change'
  return `${prefix}/${slug}`
}

export interface DispatchRequest {
  appId: string
  cardId: string
  prompt: string
  type: CardType
  baseBranch?: string
  title?: string
  /** Specific model within the agent ('' / undefined = agent default). */
  model?: string
  /** Override the repo's default agent (used by auto-retry fallback). */
  agentId?: CodingAgentId
}

/** Either a live run, or a note that the card was queued (concurrency cap hit). */
export type DispatchResult = { runId: string; branch: string; agentId: CodingAgentId } | { queued: true; agentId: CodingAgentId }

const PRI_RANK: Record<Priority, number> = { high: 0, med: 1, low: 2 }

export interface NewCardInput {
  appId: string
  type?: CardType
  priority?: Priority
  title?: string
  desc?: string
  prompt?: string
}

/** Map a run status onto the board-facing card status. */
function runStatusToCard(s: RunStatus): CardStatus {
  if (s === 'needs_review') return 'review'
  if (s === 'merged') return 'merged'
  if (s === 'building') return 'building'
  // interrupted / failed / ready → back to ready so the user can re-dispatch.
  return 'ready'
}

export class RunManager {
  private runs = new Map<string, RunRecord>()
  private cards = new Map<string, CardRecord>()
  private controllers = new Map<string, AgentController>()
  /** Card ids waiting for a free concurrency slot (FIFO within priority). */
  private queue: string[] = []
  private pumping = false
  private seq = 0

  constructor() {
    const state = loadState()
    for (const r of state.runs) this.runs.set(r.id, r)
    for (const c of state.cards) this.cards.set(c.id, c)
    this.reconcile()
    this.autoArchiveOld()
    // Rebuild the build queue from persisted `queued` cards and start what fits.
    for (const c of this.cards.values()) if (c.queued && c.status === 'ready') this.queue.push(c.id)
    if (this.queue.length) queueMicrotask(() => void this.pump())
  }

  /** Auto-archive merged cards that have been done for a while (keeps the board tidy). */
  private autoArchiveOld(): void {
    const now = Date.now()
    let changed = false
    for (const c of this.cards.values()) {
      if (c.status === 'merged' && !c.archived && now - c.updatedAt > AUTO_ARCHIVE_AFTER_MS) {
        c.archived = true
        c.archivedAt = now
        changed = true
      }
    }
    if (changed) this.persist()
  }

  /** On startup, mark runs that were building (agent crashed mid-run) as interrupted. */
  private reconcile(): void {
    let changed = false
    for (const r of this.runs.values()) {
      if (r.status === 'building') {
        r.status = 'interrupted'
        r.error = 'agent restarted while this run was in progress'
        // Bring the linked card back to a re-dispatchable state.
        const card = [...this.cards.values()].find((c) => c.runId === r.id)
        if (card) card.status = 'ready'
        changed = true
        log.warn(`reconciled orphaned run ${r.id} → interrupted`)
      }
    }
    if (changed) this.persist()
  }

  private persist(): void {
    saveState({ runs: [...this.runs.values()], cards: [...this.cards.values()] })
  }

  private activeCount(): number {
    let n = 0
    for (const r of this.runs.values()) if (r.status === 'building') n++
    return n
  }

  list(): RunRecord[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  get(id: string): RunRecord | undefined {
    return this.runs.get(id)
  }

  private update(id: string, patch: Partial<RunRecord>): RunRecord | undefined {
    const r = this.runs.get(id)
    if (!r) return undefined
    Object.assign(r, patch, { updatedAt: Date.now() })
    this.persist()
    return r
  }

  private setStep(r: RunRecord, step: StepId, state: StepState): void {
    const idx = STEP_ORDER.indexOf(step)
    r.steps = STEP_ORDER.map((id, i) => ({
      id,
      state: i < idx ? 'done' : i === idx ? state : 'pending',
    }))
    bus.publish({ type: 'run.step', runId: r.id, step, state })
  }

  private appById(appId: string): AppRecord | undefined {
    return loadConfig().apps.find((a) => a.id === appId)
  }

  // ---- cards (spec §9 cards table) ----
  listCards(): CardRecord[] {
    return [...this.cards.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  getCard(id: string): CardRecord | undefined {
    return this.cards.get(id)
  }

  createCard(input: NewCardInput): CardRecord {
    const now = Date.now()
    const card: CardRecord = {
      id: `card_${now.toString(36)}_${(this.seq++).toString(36)}`,
      appId: input.appId,
      type: input.type ?? 'feature',
      priority: input.priority ?? 'med',
      status: 'ideas',
      title: input.title ?? 'Untitled card',
      desc: input.desc ?? '',
      prompt: input.prompt ?? '',
      createdAt: now,
      updatedAt: now,
    }
    this.cards.set(card.id, card)
    this.persist()
    bus.publish({ type: 'card.update', card })
    return card
  }

  /** Patch editable card fields (prompt, title, desc, type, priority) and
   *  non-build status moves (ideas↔ready↔merged via drag). */
  patchCard(id: string, patch: Partial<Pick<CardRecord, 'title' | 'desc' | 'prompt' | 'type' | 'priority' | 'status' | 'base' | 'order' | 'model'>>): CardRecord {
    const card = this.cards.get(id)
    if (!card) throw new Error('unknown card')
    // Moving a queued card out of the queue (e.g. dragging it) cancels the queue slot.
    if (patch.status && card.queued) {
      card.queued = false
      this.queue = this.queue.filter((q) => q !== id)
      this.emitQueue()
    }
    Object.assign(card, patch, { updatedAt: Date.now() })
    this.persist()
    bus.publish({ type: 'card.update', card })
    return card
  }

  deleteCard(id: string): void {
    const card = this.cards.get(id)
    if (!card) throw new Error('unknown card')
    if (card.status === 'building') throw new Error('stop the build before deleting this card')
    this.queue = this.queue.filter((q) => q !== id)
    this.cards.delete(id)
    this.persist()
    bus.publish({ type: 'card.remove', cardId: id })
    if (card.queued) this.emitQueue()
  }

  /** Archive/unarchive a card (hidden from the board, kept for history/search). */
  setArchived(id: string, archived: boolean): CardRecord {
    const card = this.cards.get(id)
    if (!card) throw new Error('unknown card')
    if (archived && card.status !== 'merged') throw new Error('only merged cards can be archived')
    card.archived = archived
    card.archivedAt = archived ? Date.now() : undefined
    card.updatedAt = Date.now()
    this.persist()
    bus.publish({ type: 'card.update', card })
    return card
  }

  /** Archive every (non-archived) merged card in an app — the "Clear shipped" action. */
  archiveMerged(appId: string): { archived: number } {
    let n = 0
    const now = Date.now()
    for (const c of this.cards.values()) {
      if (c.appId === appId && c.status === 'merged' && !c.archived) {
        c.archived = true
        c.archivedAt = now
        c.updatedAt = now
        bus.publish({ type: 'card.update', card: c })
        n++
      }
    }
    if (n) this.persist()
    return { archived: n }
  }

  /** All runs for a card (every attempt: retries + race contenders), newest first. */
  runsForCard(cardId: string): RunRecord[] {
    return [...this.runs.values()].filter((r) => r.cardId === cardId).sort((a, b) => b.createdAt - a.createdAt)
  }

  /** Aggregate build stats (success rate + avg duration) per agent/model. */
  metrics(appId?: string): MetricsResult {
    const runs = [...this.runs.values()].filter((r) => !appId || r.appId === appId)
    const isSuccess = (s: RunStatus) => s === 'needs_review' || s === 'merged'
    const isFailed = (s: RunStatus) => s === 'failed' || s === 'interrupted'
    const isTerminal = (s: RunStatus) => isSuccess(s) || isFailed(s)

    const groups = new Map<string, { agentId: CodingAgentId; model: string; total: number; success: number; failed: number; durations: number[] }>()
    let tTotal = 0
    let tSuccess = 0
    let tFailed = 0
    const tDurations: number[] = []

    for (const r of runs) {
      if (!isTerminal(r.status)) continue
      const agentId = (r.agentId ?? 'codex') as CodingAgentId
      const model = r.model || 'default'
      const key = `${agentId}/${model}`
      let g = groups.get(key)
      if (!g) {
        g = { agentId, model, total: 0, success: 0, failed: 0, durations: [] }
        groups.set(key, g)
      }
      g.total++
      tTotal++
      if (isSuccess(r.status)) {
        g.success++
        tSuccess++
      } else {
        g.failed++
        tFailed++
      }
      const dur = r.updatedAt - r.createdAt
      if (dur > 0) {
        g.durations.push(dur)
        tDurations.push(dur)
      }
    }

    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
    const byAgent = [...groups.values()]
      .map((g) => ({ agentId: g.agentId, model: g.model, total: g.total, success: g.success, failed: g.failed, avgMs: avg(g.durations) }))
      .sort((a, b) => b.total - a.total)
    return { totals: { total: tTotal, success: tSuccess, failed: tFailed, avgMs: avg(tDurations) }, byAgent }
  }

  /** Remove all cards + runs for an app (used when a repo is removed). Cleans up
   *  each run's worktree. Refuses if a run for the app is still building. */
  async removeAppData(appId: string, repoPath: string): Promise<void> {
    for (const r of this.runs.values()) {
      if (r.appId === appId && r.status === 'building') {
        throw new Error('stop in-progress builds before removing this repo')
      }
    }
    for (const r of [...this.runs.values()]) {
      if (r.appId !== appId) continue
      await removeWorktree(repoPath, r.worktreePath).catch(() => undefined)
      this.runs.delete(r.id)
    }
    for (const c of [...this.cards.values()]) {
      if (c.appId !== appId) continue
      this.cards.delete(c.id)
      bus.publish({ type: 'card.remove', cardId: c.id })
    }
    this.persist()
  }

  /** Reflect a run's status/branch onto its linked card and broadcast it. */
  private syncCardFromRun(run: RunRecord): void {
    const card =
      [...this.cards.values()].find((c) => c.runId === run.id || c.raceRunIds?.includes(run.id)) || this.cards.get(run.cardId)
    if (!card) return

    // Race: the card stays Building until every contender is done, then Review.
    if (card.raceRunIds?.includes(run.id)) {
      const raceRuns = card.raceRunIds.map((id) => this.runs.get(id)).filter(Boolean) as RunRecord[]
      const done = (r: RunRecord) => r.status === 'needs_review' || r.status === 'merged' || r.status === 'failed'
      card.status = raceRuns.every(done) ? 'review' : raceRuns.some((r) => r.status === 'building') ? 'building' : 'review'
      card.updatedAt = Date.now()
      bus.publish({ type: 'card.update', card })
      return
    }

    card.status = runStatusToCard(run.status)
    card.branch = run.branch
    if (run.prUrl) card.prUrl = run.prUrl
    if (run.status === 'merged') card.mergedAt = run.prUrl ? 'Pull request opened just now' : 'Merged just now'
    card.updatedAt = Date.now()
    bus.publish({ type: 'card.update', card })
  }

  /** Plan-first: approve the plan and let the agent implement it. */
  async approvePlan(runId: string): Promise<RunRecord> {
    const r = this.runs.get(runId)
    if (!r) throw new Error('unknown run')
    if (r.phase !== 'plan_review') throw new Error('this run has no plan awaiting approval')
    r.phase = 'build'
    this.update(runId, { status: 'building', progress: 30 })
    bus.publish({ type: 'run.status', runId, status: 'building' })
    this.spawnCodex(r, 'The plan is approved. Implement it now — make the code changes.', 'build')
    return r
  }

  /** Plan-first: re-plan with feedback before any code is written. */
  async requestPlanChanges(runId: string, feedback?: string): Promise<RunRecord> {
    const r = this.runs.get(runId)
    if (!r) throw new Error('unknown run')
    this.update(runId, { status: 'building' })
    bus.publish({ type: 'run.status', runId, status: 'building' })
    this.spawnCodex(r, feedback?.trim() || 'Revise the plan based on this feedback.', 'plan')
    return r
  }

  /** Race: keep the chosen run (approve it) and discard the others. */
  async pickWinner(cardId: string, winnerRunId: string): Promise<CardRecord> {
    const card = this.cards.get(cardId)
    if (!card?.raceRunIds?.includes(winnerRunId)) throw new Error('not a valid race winner')
    const losers = card.raceRunIds.filter((id) => id !== winnerRunId)
    // Treat the winner as the card's run so approve() runs the normal merge path.
    card.runId = winnerRunId
    card.raceRunIds = undefined
    this.persist()
    await this.approve(winnerRunId)
    for (const id of losers) {
      this.controllers.get(id)?.kill()
      this.controllers.delete(id)
      const r = this.runs.get(id)
      if (r) {
        const app = this.appById(r.appId)
        if (app) await removeWorktree(app.localPath, r.worktreePath).catch(() => undefined)
        this.runs.delete(id)
      }
    }
    this.persist()
    void this.pump()
    return card
  }

  /** Wrap a task in a plan-only instruction (for plan-first mode). */
  private planPrompt(task: string): string {
    return `Before writing any code, produce a concise, numbered implementation plan for this task: list the files you'll change and your approach. Do NOT make any changes yet.\n\nTask:\n${task}`
  }

  /** Create a worktree + run record for one agent. Does not spawn or link a card. */
  private async createRun(req: DispatchRequest, agentId: CodingAgentId, forceWorktree: boolean): Promise<RunRecord> {
    const cfg = loadConfig()
    if (this.activeCount() >= cfg.concurrency) {
      throw new Error(`concurrency cap reached (${cfg.concurrency} runs building)`)
    }
    const app = this.appById(req.appId)
    if (!app) throw new Error(`unknown app: ${req.appId}`)
    if (!existsSync(app.localPath)) throw new Error(`repo not cloned: ${app.localPath}`)

    const buildLocation = forceWorktree ? 'worktree' : app.buildLocation ?? 'worktree'
    const baseBranch = await resolveBaseBranch(app.localPath, req.baseBranch || app.defaultBranch)
    // Unique branch name (re-dispatch / racing several agents must not collide).
    const baseSlug = branchSlug(req.title || req.cardId, req.type)
    let branch = baseSlug
    for (let n = 1; await branchExists(app.localPath, branch); n++) branch = `${baseSlug}-${n}`
    const runId = `r_${Date.now().toString(36)}_${(this.seq++).toString(36)}`

    let worktreePath: string
    if (buildLocation === 'workdir') {
      if (this.list().some((x) => x.appId === req.appId && x.status === 'building')) {
        throw new Error('another build is already running in this repo — in-working-copy mode runs one at a time')
      }
      if (!(await isClean(app.localPath))) {
        throw new Error('your working copy has uncommitted changes — commit or stash them first, or switch this repo to isolated-worktree builds')
      }
      worktreePath = app.localPath
      const co = await execCmd('git', ['checkout', '-b', branch, baseBranch], { cwd: app.localPath })
      if (co.code !== 0) throw new Error(`could not create branch '${branch}': ${co.stderr.trim().split('\n').slice(-2).join(' ')}`)
    } else {
      worktreePath = join(WORKTREES_DIR, runId)
      const wt = await addWorktree(app.localPath, worktreePath, branch, baseBranch)
      if (wt.code !== 0) throw new Error(`git worktree add failed: ${wt.stderr.trim()}`)
    }

    const now = Date.now()
    const r: RunRecord = {
      id: runId,
      appId: req.appId,
      cardId: req.cardId,
      title: req.title,
      prompt: req.prompt,
      type: req.type,
      baseBranch,
      branch,
      worktreePath,
      agentId,
      model: req.model?.trim() || undefined,
      attempt: 1,
      status: 'building',
      progress: 0,
      steps: STEP_ORDER.map((id) => ({ id, state: 'pending' })),
      logs: [`$ ${getAgent(agentId).label}${req.model?.trim() ? ` (${req.model.trim()})` : ''} · branch ${branch} off ${baseBranch}`],
      diff: [],
      chat: [],
      createdAt: now,
      updatedAt: now,
    }
    this.runs.set(runId, r)
    this.persist()
    return r
  }

  /** Dispatch a card: build now if a slot is free, otherwise queue it (spec §5–§6). */
  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    const app = this.appById(req.appId)
    if (!app) throw new Error(`unknown app: ${req.appId}`)
    const agentId = req.agentId ?? app.agent ?? 'codex'
    const card = this.cards.get(req.cardId)
    const model = req.model ?? card?.model

    // At capacity → queue the card (no run yet) and surface it on the board.
    if (this.activeCount() >= loadConfig().concurrency) {
      if (card) {
        card.queued = true
        card.status = 'ready'
        card.runId = undefined
        card.raceRunIds = undefined
        if (model !== undefined) card.model = model || undefined
        card.updatedAt = Date.now()
        bus.publish({ type: 'card.update', card })
      }
      if (!this.queue.includes(req.cardId)) this.queue.push(req.cardId)
      this.persist()
      this.emitQueue()
      return { queued: true, agentId }
    }

    const r = await this.startDispatch({ ...req, model }, agentId, model, !!app.planFirst)
    return { runId: r.id, branch: r.branch, agentId }
  }

  /** Create the run, link the card, spawn the agent. Assumes a slot is free. */
  private async startDispatch(req: DispatchRequest, agentId: CodingAgentId, model: string | undefined, planFirst: boolean): Promise<RunRecord> {
    const r = await this.createRun({ ...req, model }, agentId, false)
    const card = this.cards.get(req.cardId)
    if (card) {
      card.runId = r.id
      card.raceRunIds = undefined
      card.queued = false
      card.status = 'building'
      card.branch = r.branch
      if (model !== undefined) card.model = model || undefined
      card.updatedAt = Date.now()
      bus.publish({ type: 'card.update', card })
    }
    bus.publish({ type: 'run.status', runId: r.id, status: 'building' })
    if (planFirst) this.spawnCodex(r, this.planPrompt(req.prompt), 'plan')
    else this.spawnCodex(r, req.prompt, 'build')
    this.persist()
    this.emitQueue()
    return r
  }

  /** Dispatch (or queue) every Ready card in an app — the bulk "Build all" action. */
  async dispatchReady(appId: string): Promise<{ started: number; queued: number }> {
    const ready = this.listCards()
      .filter((c) => c.appId === appId && c.status === 'ready' && !c.queued && !c.raceRunIds)
      .sort((a, b) => PRI_RANK[a.priority] - PRI_RANK[b.priority] || a.createdAt - b.createdAt)
    let started = 0
    let queued = 0
    for (const c of ready) {
      try {
        const res = await this.dispatch({ appId, cardId: c.id, prompt: c.prompt, type: c.type, baseBranch: c.base, title: c.title, model: c.model })
        if ('queued' in res) queued++
        else started++
      } catch (err) {
        bus.publish({ type: 'notice', level: 'error', message: `Couldn't start "${c.title}": ${(err as Error).message}`, appId })
      }
    }
    return { started, queued }
  }

  /** Remove a queued card from the build queue (it goes back to Ready). */
  dequeue(cardId: string): CardRecord {
    const card = this.cards.get(cardId)
    if (!card) throw new Error('unknown card')
    if (!card.queued) return card // not queued (e.g. already started) — nothing to cancel
    this.queue = this.queue.filter((id) => id !== cardId)
    card.queued = false
    card.status = 'ready'
    card.updatedAt = Date.now()
    this.persist()
    bus.publish({ type: 'card.update', card })
    this.emitQueue()
    return card
  }

  /** Current concurrency snapshot (cap, active runs, queued cards). */
  queueInfo(): { concurrency: number; active: number; queued: number } {
    return { concurrency: loadConfig().concurrency, active: this.activeCount(), queued: this.queue.length }
  }

  private emitQueue(): void {
    const q = this.queueInfo()
    bus.publish({ type: 'queue.update', ...q })
  }

  /** Start queued cards while slots are free (highest priority first). */
  private async pump(): Promise<void> {
    if (this.pumping) return
    this.pumping = true
    try {
      const cap = loadConfig().concurrency
      while (this.activeCount() < cap && this.queue.length) {
        const ordered = [...this.queue].sort((a, b) => {
          const ca = this.cards.get(a)
          const cb = this.cards.get(b)
          if (!ca || !cb) return 0
          return PRI_RANK[ca.priority] - PRI_RANK[cb.priority] || ca.createdAt - cb.createdAt
        })
        const cardId = ordered[0]
        this.queue = this.queue.filter((id) => id !== cardId)
        const card = this.cards.get(cardId)
        if (!card || !card.queued) continue
        await this.startQueuedCard(card)
      }
    } finally {
      this.pumping = false
      this.emitQueue()
    }
  }

  private async startQueuedCard(card: CardRecord): Promise<void> {
    const app = this.appById(card.appId)
    try {
      if (!app) throw new Error('repo is no longer registered')
      await this.startDispatch(
        { appId: card.appId, cardId: card.id, prompt: card.prompt, type: card.type, baseBranch: card.base, title: card.title, model: card.model },
        app.agent ?? 'codex',
        card.model,
        !!app.planFirst,
      )
    } catch (err) {
      card.queued = false
      card.status = 'ready'
      card.updatedAt = Date.now()
      this.persist()
      bus.publish({ type: 'card.update', card })
      bus.publish({ type: 'notice', level: 'error', message: `Couldn't start "${card.title}": ${(err as Error).message}`, appId: card.appId })
    }
  }

  /** Race: build the same card with every installed agent in parallel worktrees. */
  async race(req: DispatchRequest, agentIds: CodingAgentId[]): Promise<{ runIds: string[] }> {
    if (agentIds.length < 2) throw new Error('need at least two agents to race')
    const runs: RunRecord[] = []
    for (const a of agentIds) runs.push(await this.createRun(req, a, true))
    const card = this.cards.get(req.cardId)
    if (card) {
      card.raceRunIds = runs.map((r) => r.id)
      card.runId = undefined
      card.status = 'building'
      card.updatedAt = Date.now()
      bus.publish({ type: 'card.update', card })
    }
    this.persist()
    for (const r of runs) {
      bus.publish({ type: 'run.status', runId: r.id, status: 'building' })
      this.spawnCodex(r, req.prompt, 'build')
    }
    return { runIds: runs.map((r) => r.id) }
  }

  private spawnCodex(r: RunRecord, prompt: string, mode: 'plan' | 'build' = 'build'): void {
    let lastMessage: string | undefined
    const ctrl = getAgent(r.agentId).run(
      { worktreePath: r.worktreePath, prompt, sessionId: r.sessionId, mode, model: r.model },
      {
        onLog: (line, stream) => {
          r.logs.push(line)
          bus.publish({ type: 'run.log', runId: r.id, line, stream })
        },
        onStep: (step, state) => this.setStep(r, step, state),
        onProgress: (pct) => {
          r.progress = pct
          bus.publish({ type: 'run.progress', runId: r.id, pct })
        },
        onSession: (sid) => {
          r.sessionId = sid
        },
        onMessage: (text) => {
          lastMessage = text
        },
        onExit: (code) => this.onCodexExit(r, code, lastMessage, mode),
      },
    )
    this.controllers.set(r.id, ctrl)
  }

  private async onCodexExit(r: RunRecord, code: number, lastMessage: string | undefined, mode: 'plan' | 'build'): Promise<void> {
    this.controllers.delete(r.id)
    if (r.status !== 'building') return // stopped by user

    if (code !== 0) {
      this.update(r.id, { status: 'failed', error: `the agent exited with code ${code}`, progress: r.progress })
      bus.publish({ type: 'run.status', runId: r.id, status: 'failed' })
      const app = this.appById(r.appId)
      const isRace = [...this.cards.values()].some((c) => c.raceRunIds?.includes(r.id))
      // Auto-retry / fallback: one fresh attempt with the other agent (or a refined prompt).
      if (app?.autoRetry && mode === 'build' && !isRace && (r.attempt ?? 1) < 2) {
        await this.autoRetry(r)
        this.persist()
        void this.pump()
        return
      }
      this.syncCardFromRun(r)
      this.persist()
      void this.pump()
      return
    }

    // Plan-first: a plan run produces a plan to approve, not code changes.
    if (mode === 'plan') {
      r.plan = lastMessage?.trim() || '(the agent did not return a plan)'
      r.phase = 'plan_review'
      r.progress = 30
      this.update(r.id, {})
      bus.publish({ type: 'run.plan', runId: r.id, plan: r.plan })
      return
    }

    // Settle: capture the diff and move to review.
    const raw = await captureDiff(r.worktreePath, r.baseBranch)
    const files = parseUnifiedDiff(raw)
    r.diff = files
    bus.publish({ type: 'run.diff', runId: r.id, files })
    this.setStep(r, 'pr', 'done')

    // Use Codex's own closing message for the review chat when available.
    const text = lastMessage?.trim() || `Build complete on \`${r.branch}\`. ${files.length} file(s) changed.`
    const msg = this.agentMessage(text)
    r.chat.push(msg)
    bus.publish({ type: 'run.message', runId: r.id, message: msg })

    this.update(r.id, { status: 'needs_review', progress: 100 })
    bus.publish({ type: 'run.status', runId: r.id, status: 'needs_review' })
    this.syncCardFromRun(r)
    this.persist()
    void this.pump()
  }

  /** Spawn a fresh attempt after a failure: prefer the other installed agent. */
  private async autoRetry(failed: RunRecord): Promise<void> {
    const card = [...this.cards.values()].find((c) => c.runId === failed.id) ?? this.cards.get(failed.cardId)
    try {
      const installed = (await probeAgents()).filter((a) => a.installed).map((a) => a.id)
      const other = installed.find((id) => id !== failed.agentId)
      const nextAgent: CodingAgentId = other ?? failed.agentId ?? 'codex'
      // Falling back to a different agent → drop the model (it's agent-specific).
      // Same agent again → keep the model but nudge it to try a different approach.
      const model = other ? undefined : failed.model
      const prompt = other ? failed.prompt : `${failed.prompt}\n\n(Note: a previous attempt failed before finishing. Take a different approach and make sure the build completes.)`
      const r = await this.createRun(
        { appId: failed.appId, cardId: failed.cardId, prompt, type: failed.type, baseBranch: failed.baseBranch !== 'HEAD' ? failed.baseBranch : undefined, title: failed.title, model },
        nextAgent,
        false,
      )
      r.attempt = (failed.attempt ?? 1) + 1
      r.retryOf = failed.id
      failed.retriedAs = r.id
      if (card) {
        card.runId = r.id
        card.status = 'building'
        card.branch = r.branch
        card.updatedAt = Date.now()
        bus.publish({ type: 'card.update', card })
      }
      bus.publish({ type: 'run.status', runId: r.id, status: 'building' })
      bus.publish({ type: 'notice', level: 'info', message: `${getAgent(failed.agentId).label} build failed — retrying with ${getAgent(nextAgent).label}…`, appId: failed.appId })
      this.spawnCodex(r, prompt, 'build')
    } catch (err) {
      // Couldn't start a retry — leave the card re-dispatchable.
      if (card) {
        card.status = 'ready'
        card.updatedAt = Date.now()
        bus.publish({ type: 'card.update', card })
      }
      bus.publish({ type: 'notice', level: 'error', message: `Auto-retry failed to start: ${(err as Error).message}`, appId: failed.appId })
    }
  }

  private agentMessage(text: string): ChatMessage {
    return { role: 'agent', text, ts: Date.now() }
  }

  /** Follow-up chat → continue the same Codex session, re-capture diff (spec §7). */
  async sendMessage(id: string, text: string): Promise<RunRecord> {
    const r = this.runs.get(id)
    if (!r) throw new Error('unknown run')
    const userMsg: ChatMessage = { role: 'user', text, ts: Date.now() }
    r.chat.push(userMsg)
    bus.publish({ type: 'run.message', runId: id, message: userMsg })
    this.update(id, { status: 'building', progress: 0 })
    bus.publish({ type: 'run.status', runId: id, status: 'building' })
    this.syncCardFromRun(r)
    this.persist()
    this.spawnCodex(r, text)
    return r
  }

  /** Request changes = a chat turn that re-runs Codex with the feedback. */
  async requestChanges(id: string, feedback?: string): Promise<RunRecord> {
    return this.sendMessage(id, feedback?.trim() || 'Please address the review feedback and update the branch.')
  }

  /** Commit, then either open a PR (per-app `mergeStrategy: 'pr'`) or fast-forward
   *  merge locally, then remove the worktree. Captures the PR URL when opened. */
  async approve(id: string): Promise<RunRecord> {
    const r = this.runs.get(id)
    if (!r) throw new Error('unknown run')
    const cfg = loadConfig()
    const app = this.appById(r.appId)
    if (!app) throw new Error('unknown app')

    // 'workdir' runs build in the user's own checkout (worktreePath === localPath);
    // there's no separate worktree to remove, and merges/checkouts happen in place.
    const isWorkdir = resolve(r.worktreePath) === resolve(app.localPath)

    if (await hasStagedOrUnstagedChanges(r.worktreePath)) {
      await commitAll(r.worktreePath, r.title || r.branch)
    }

    const strategy = app.mergeStrategy ?? cfg.mergeStrategy
    if (strategy === 'pr') {
      const remoteUrl = await getRemoteUrl(app.localPath)
      if (!remoteUrl) {
        throw new Error('this repo has no git remote — add one (git remote add origin …) or switch it to "Merge locally"')
      }
      const forge = forgeOfUrl(remoteUrl)
      const ready = await forgeReady(forge)
      if (!ready.ok) throw new Error(`${ready.reason}, or switch this repo to "Merge locally"`)
      const isGitlab = forge === 'gitlab'
      // The PR/MR target must be a real branch name that exists on the remote. The
      // run's baseBranch may be 'HEAD' (a fine worktree base, but git rejects it as
      // a revision) — fall back to the repo's default branch.
      const prBase = r.baseBranch && r.baseBranch !== 'HEAD' ? r.baseBranch : app.defaultBranch || 'main'
      // Fresh repos may never have pushed their default branch, so the base
      // wouldn't exist on the remote. Push it first if it's missing.
      const baseOnRemote = (await execCmd('git', ['ls-remote', '--heads', 'origin', prBase], { cwd: app.localPath })).stdout.trim()
      if (!baseOnRemote) {
        const pb = await execCmd('git', ['push', 'origin', prBase], { cwd: app.localPath })
        if (pb.code !== 0) throw new Error(`could not push the base branch '${prBase}' to the remote: ${pb.stderr.trim().split('\n').slice(-2).join(' ')}`)
      }
      const push = await execCmd('git', ['push', '-u', 'origin', r.branch], { cwd: r.worktreePath })
      if (push.code !== 0) throw new Error(`git push failed: ${push.stderr.trim().split('\n').slice(-2).join(' ')}`)
      const pr = await createPullRequest(forge, r.worktreePath, r.branch, prBase)
      if (!pr.ok) throw new Error(`branch pushed, but opening the ${isGitlab ? 'merge request' : 'pull request'} failed: ${pr.error}`)
      r.prUrl = pr.url
      // In-working-copy builds leave the user on the feature branch — return them
      // to the default branch now that it's pushed/PR'd.
      if (isWorkdir) await execCmd('git', ['checkout', app.defaultBranch], { cwd: app.localPath })
    } else {
      const co = await execCmd('git', ['checkout', app.defaultBranch], { cwd: app.localPath })
      if (co.code !== 0) throw new Error(`could not checkout ${app.defaultBranch}: ${co.stderr.trim()}`)
      const merge = await execCmd('git', ['merge', '--ff-only', r.branch], { cwd: app.localPath })
      if (merge.code !== 0) throw new Error(`fast-forward merge failed: ${merge.stderr.trim().split('\n').slice(-2).join(' ')}`)
    }

    // Only isolated worktrees get removed; a 'workdir' build is the user's own repo.
    if (!isWorkdir) await removeWorktree(app.localPath, r.worktreePath)
    this.update(id, { status: 'merged' })
    bus.publish({ type: 'run.status', runId: id, status: 'merged' })
    this.syncCardFromRun(r)
    this.persist()
    void this.pump()
    return r
  }

  /** Kill the child process but keep partial work in the worktree (spec §4). */
  stop(id: string): RunRecord {
    const r = this.runs.get(id)
    if (!r) throw new Error('unknown run')
    this.controllers.get(id)?.kill()
    this.controllers.delete(id)
    this.update(id, { status: 'ready' })
    bus.publish({ type: 'run.status', runId: id, status: 'ready' })
    this.syncCardFromRun(r)
    this.persist()
    void this.pump()
    return r
  }

  /** Check out this run's branch in the user's own repo so they can work on it
   *  locally (used for merged/PR'd cards whose isolated worktree is gone). */
  async checkoutBranch(id: string): Promise<{ branch: string; path: string }> {
    const r = this.runs.get(id)
    if (!r) throw new Error('unknown run')
    const app = this.appById(r.appId)
    if (!app) throw new Error('unknown app')
    if (resolve(r.worktreePath) === resolve(app.localPath)) {
      // A 'workdir' build already lives in the user's checkout.
      const co = await execCmd('git', ['checkout', r.branch], { cwd: app.localPath })
      if (co.code !== 0) throw new Error(`could not check out '${r.branch}': ${co.stderr.trim().split('\n').slice(-2).join(' ')}`)
      return { branch: r.branch, path: app.localPath }
    }
    if (!(await isClean(app.localPath))) {
      throw new Error('your working copy has uncommitted changes — commit or stash them first')
    }
    // Recover the branch ref from origin if it isn't present locally anymore.
    if (!(await branchExists(app.localPath, r.branch))) {
      await execCmd('git', ['fetch', 'origin', `${r.branch}:${r.branch}`], { cwd: app.localPath })
    }
    const co = await execCmd('git', ['checkout', r.branch], { cwd: app.localPath })
    if (co.code !== 0) throw new Error(`could not check out '${r.branch}': ${co.stderr.trim().split('\n').slice(-2).join(' ')}`)
    return { branch: r.branch, path: app.localPath }
  }

  /** The folder to open for this run — the live worktree, or the repo itself. */
  folderFor(id: string): string {
    const r = this.runs.get(id)
    if (!r) throw new Error('unknown run')
    return existsSync(r.worktreePath) ? r.worktreePath : this.appById(r.appId)?.localPath ?? r.worktreePath
  }

  /** Decompose a big idea into scoped sub-cards (async; results arrive via WS).
   *  Returns once the read-only agent run has been kicked off. */
  async decompose(cardId: string): Promise<void> {
    const card = this.cards.get(cardId)
    if (!card) throw new Error('unknown card')
    const app = this.appById(card.appId)
    if (!app) throw new Error('unknown app')
    if (!existsSync(app.localPath)) throw new Error('clone the repo before splitting ideas')
    const agentId = app.agent ?? 'codex'
    const idea = [card.title, card.desc, card.prompt].map((s) => (s || '').trim()).filter(Boolean).join('\n\n')
    const prompt =
      `You are breaking a large product idea into smaller, independently-shippable cards for a kanban board.\n\n` +
      `IDEA:\n${idea}\n\n` +
      `Respond with ONLY a JSON array (no markdown fences, no prose) of 2 to 5 objects. Each object has:\n` +
      `- "title": a short imperative title for the card\n` +
      `- "type": "feature" | "bug" | "enhancement"\n` +
      `- "prompt": a user story followed by BDD acceptance criteria, written EXACTLY in this shape:\n` +
      `    "As a <role>, I want <capability>, so that <benefit>.\\n\\nAcceptance Criteria:\\n\\nScenario: <short name>\\nGiven <precondition>\\nWhen <action>\\nThen <expected outcome>"\n` +
      `  Include 1 to 3 Given/When/Then scenarios per card (separate scenarios with a blank line). Use real, repo-specific detail where possible.\n\n` +
      `Order the cards by a sensible build sequence.`

    this.runOneshot(app.localPath, agentId, prompt)
      .then(({ text }) => {
        const specs = parseDecompose(text)
        if (!specs.length) {
          bus.publish({ type: 'notice', level: 'error', message: `Couldn't split "${card.title}" — the agent didn't return a usable breakdown.`, appId: card.appId, cardId: card.id })
          return
        }
        for (const spec of specs) {
          const now = Date.now()
          const sub: CardRecord = {
            id: `card_${now.toString(36)}_${(this.seq++).toString(36)}`,
            appId: card.appId,
            type: spec.type,
            priority: card.priority,
            status: 'ideas',
            title: spec.title,
            desc: `${spec.title}\nNote: Split from "${card.title}"`,
            prompt: spec.prompt,
            parentId: card.id,
            createdAt: now,
            updatedAt: now,
          }
          this.cards.set(sub.id, sub)
          bus.publish({ type: 'card.update', card: sub })
        }
        this.persist()
        bus.publish({ type: 'notice', level: 'info', message: `Split "${card.title}" into ${specs.length} cards.`, appId: card.appId, cardId: card.id })
      })
      .catch((err) => {
        bus.publish({ type: 'notice', level: 'error', message: `Decompose failed: ${(err as Error).message}`, appId: card.appId, cardId: card.id })
      })
  }

  /** Fetch CI checks for a run's pull request (GitHub today). */
  async checksFor(runId: string): Promise<ChecksResult> {
    const r = this.runs.get(runId)
    if (!r) throw new Error('unknown run')
    const prUrl = r.prUrl ?? null
    if (!prUrl) return { forge: 'other', prUrl: null, state: 'none', checks: [] }
    const forge = forgeOfUrl(prUrl)
    if (forge !== 'github') return { forge, prUrl, state: 'unsupported', checks: [] }
    const cwd = this.appById(r.appId)?.localPath ?? r.worktreePath
    const checks = await ghChecks(cwd, prUrl)
    const buckets = checks.map((c) => (c.bucket || '').toLowerCase())
    const state: ChecksResult['state'] = !checks.length
      ? 'none'
      : buckets.includes('fail') || buckets.includes('cancel')
        ? 'failure'
        : buckets.includes('pending')
          ? 'pending'
          : 'success'
    return { forge, prUrl, state, checks }
  }

  /** Scan a repo and (over)write an AGENTS.md the coding agent can use. */
  async generateAgentsMd(appId: string, force: boolean): Promise<{ path: string; bytes: number; overwritten: boolean }> {
    const app = this.appById(appId)
    if (!app) throw new Error('unknown app')
    if (!existsSync(app.localPath)) throw new Error('clone the repo before generating AGENTS.md')
    const file = join(app.localPath, 'AGENTS.md')
    const existed = existsSync(file)
    if (existed && !force) {
      const e = new Error('AGENTS.md already exists') as Error & { code?: string }
      e.code = 'EXISTS'
      throw e
    }
    const agentId = app.agent ?? 'codex'
    const prompt =
      `Scan THIS repository (read the README, package manifests, config, and source layout) and write the full contents of an AGENTS.md file ` +
      `that helps an AI coding agent work here effectively. Cover: a one-paragraph project overview, the tech stack, how to install/build/test/run, ` +
      `the directory layout, code conventions, and any gotchas. Be concrete and specific to THIS repo — do not invent commands; only list ones you can confirm from the files. ` +
      `Output ONLY the markdown body of AGENTS.md — no surrounding code fences, no preamble, no closing remarks.`
    const { text } = await this.runOneshot(app.localPath, agentId, prompt)
    const content = stripFences(text).trim()
    if (!content) throw new Error('the agent returned no content to write')
    writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
    log.info(`${existed ? 'updated' : 'created'} AGENTS.md for ${app.name} (${Buffer.byteLength(content)} bytes)`)
    return { path: file, bytes: Buffer.byteLength(content), overwritten: existed }
  }

  /** Run an agent read-only (no worktree, no run record) and resolve its final text. */
  private runOneshot(cwd: string, agentId: CodingAgentId, prompt: string): Promise<{ code: number; text: string }> {
    return new Promise((resolve) => {
      let last: string | undefined
      getAgent(agentId).run(
        { worktreePath: cwd, prompt, mode: 'plan' },
        {
          onLog: () => {},
          onStep: () => {},
          onProgress: () => {},
          onMessage: (text) => {
            last = text
          },
          onExit: (code) => resolve({ code, text: (last ?? '').trim() }),
        },
      )
    })
  }

  /** Re-attach build timers/streams after a refresh is handled by the WS layer;
   *  this exposes whether a run is currently live. */
  isLive(id: string): boolean {
    return this.controllers.has(id)
  }
}

export const runManager = new RunManager()
