import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, loadState, saveState, WORKTREES_DIR } from './config.js'
import { runCodex, type CodexController } from './lib/codex.js'
import { parseUnifiedDiff } from './lib/diff.js'
import { bus } from './lib/events.js'
import { addWorktree, branchExists, captureDiff, commitAll, getRemoteUrl, hasStagedOrUnstagedChanges, removeWorktree, resolveBaseBranch, run as execCmd } from './lib/git.js'
import { ghAuthed, ghCreatePr, ghInstalled } from './lib/gh.js'
import { log } from './lib/log.js'
import type { AppRecord, CardRecord, CardStatus, CardType, ChatMessage, Priority, RunRecord, RunStatus, StepId, StepState } from './types.js'

const STEP_ORDER: StepId[] = ['cloning', 'planning', 'editing', 'testing', 'pr']

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
}

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
  private controllers = new Map<string, CodexController>()
  private seq = 0

  constructor() {
    const state = loadState()
    for (const r of state.runs) this.runs.set(r.id, r)
    for (const c of state.cards) this.cards.set(c.id, c)
    this.reconcile()
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
  patchCard(id: string, patch: Partial<Pick<CardRecord, 'title' | 'desc' | 'prompt' | 'type' | 'priority' | 'status'>>): CardRecord {
    const card = this.cards.get(id)
    if (!card) throw new Error('unknown card')
    Object.assign(card, patch, { updatedAt: Date.now() })
    this.persist()
    bus.publish({ type: 'card.update', card })
    return card
  }

  deleteCard(id: string): void {
    const card = this.cards.get(id)
    if (!card) throw new Error('unknown card')
    if (card.status === 'building') throw new Error('stop the build before deleting this card')
    this.cards.delete(id)
    this.persist()
    bus.publish({ type: 'card.remove', cardId: id })
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
    const card = [...this.cards.values()].find((c) => c.runId === run.id) || this.cards.get(run.cardId)
    if (!card) return
    card.status = runStatusToCard(run.status)
    card.branch = run.branch
    if (run.prUrl) card.prUrl = run.prUrl
    if (run.status === 'merged') card.mergedAt = run.prUrl ? 'Pull request opened just now' : 'Merged just now'
    card.updatedAt = Date.now()
    bus.publish({ type: 'card.update', card })
  }

  /** Dispatch a card: create a worktree + branch and spawn Codex (spec §5–§6). */
  async dispatch(req: DispatchRequest): Promise<{ runId: string; branch: string }> {
    const cfg = loadConfig()
    if (this.activeCount() >= cfg.concurrency) {
      throw new Error(`concurrency cap reached (${cfg.concurrency} runs building)`)
    }
    const app = this.appById(req.appId)
    if (!app) throw new Error(`unknown app: ${req.appId}`)
    if (!existsSync(app.localPath)) throw new Error(`repo not cloned: ${app.localPath}`)

    // Resolve a valid base ref (handles non-`main` defaults + brand-new empty repos).
    const baseBranch = await resolveBaseBranch(app.localPath, req.baseBranch || app.defaultBranch)
    // Derive a branch name, keeping it unique so re-dispatching a card doesn't collide.
    let branch = branchSlug(req.title || req.cardId, req.type)
    if (await branchExists(app.localPath, branch)) branch = `${branch}-${Date.now().toString(36).slice(-4)}`
    const runId = `r_${Date.now().toString(36)}_${(this.seq++).toString(36)}`
    const worktreePath = join(WORKTREES_DIR, runId)

    const wt = await addWorktree(app.localPath, worktreePath, branch, baseBranch)
    if (wt.code !== 0) throw new Error(`git worktree add failed: ${wt.stderr.trim()}`)

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
      status: 'building',
      progress: 0,
      steps: STEP_ORDER.map((id) => ({ id, state: 'pending' })),
      logs: [`$ codex exec --cd ${worktreePath}`, `→ branch ${branch} off ${baseBranch}`],
      diff: [],
      chat: [],
      createdAt: now,
      updatedAt: now,
    }
    this.runs.set(runId, r)
    // Link the card (if it's an agent-managed card) to this run.
    const card = this.cards.get(req.cardId)
    if (card) {
      card.runId = runId
      card.status = 'building'
      card.branch = branch
      card.updatedAt = now
      bus.publish({ type: 'card.update', card })
    }
    this.persist()
    bus.publish({ type: 'run.status', runId, status: 'building' })

    this.spawnCodex(r, req.prompt)
    return { runId, branch }
  }

  private spawnCodex(r: RunRecord, prompt: string): void {
    let lastMessage: string | undefined
    const ctrl = runCodex(
      { worktreePath: r.worktreePath, prompt, sessionId: r.sessionId },
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
        onExit: (code) => this.onCodexExit(r, code, lastMessage),
      },
    )
    this.controllers.set(r.id, ctrl)
  }

  private async onCodexExit(r: RunRecord, code: number, lastMessage?: string): Promise<void> {
    this.controllers.delete(r.id)
    if (r.status !== 'building') return // stopped by user

    if (code !== 0) {
      this.update(r.id, { status: 'failed', error: `codex exited with code ${code}`, progress: r.progress })
      bus.publish({ type: 'run.status', runId: r.id, status: 'failed' })
      this.syncCardFromRun(r)
      this.persist()
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

    if (await hasStagedOrUnstagedChanges(r.worktreePath)) {
      await commitAll(r.worktreePath, r.title || r.branch)
    }

    const strategy = app.mergeStrategy ?? cfg.mergeStrategy
    if (strategy === 'pr') {
      if (!(await getRemoteUrl(app.localPath))) {
        throw new Error('this repo has no git remote — add one (git remote add origin …) or switch it to "Merge locally"')
      }
      if (!(await ghInstalled())) {
        throw new Error('GitHub CLI (gh) not found — install gh and run `gh auth login`, or switch this repo to "Merge locally"')
      }
      if (!(await ghAuthed())) {
        throw new Error('GitHub CLI isn’t signed in — run `gh auth login` in a terminal, or switch this repo to "Merge locally"')
      }
      const push = await execCmd('git', ['push', '-u', 'origin', r.branch], { cwd: r.worktreePath })
      if (push.code !== 0) throw new Error(`git push failed: ${push.stderr.trim().split('\n').slice(-2).join(' ')}`)
      const pr = await ghCreatePr(r.worktreePath, r.branch, r.baseBranch)
      if (!pr.ok) throw new Error(`branch pushed, but opening the PR failed: ${pr.error}`)
      r.prUrl = pr.url
    } else {
      const co = await execCmd('git', ['checkout', app.defaultBranch], { cwd: app.localPath })
      if (co.code !== 0) throw new Error(`could not checkout ${app.defaultBranch}: ${co.stderr.trim()}`)
      const merge = await execCmd('git', ['merge', '--ff-only', r.branch], { cwd: app.localPath })
      if (merge.code !== 0) throw new Error(`fast-forward merge failed: ${merge.stderr.trim().split('\n').slice(-2).join(' ')}`)
    }

    await removeWorktree(app.localPath, r.worktreePath)
    this.update(id, { status: 'merged' })
    bus.publish({ type: 'run.status', runId: id, status: 'merged' })
    this.syncCardFromRun(r)
    this.persist()
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
    return r
  }

  /** Re-attach build timers/streams after a refresh is handled by the WS layer;
   *  this exposes whether a run is currently live. */
  isLive(id: string): boolean {
    return this.controllers.has(id)
  }
}

export const runManager = new RunManager()
