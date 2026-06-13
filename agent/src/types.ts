// ---- Protocol types (see spec §4–§6). These mirror the web app's store types. ----

export type CardType = 'feature' | 'bug' | 'enhancement'
export type Priority = 'high' | 'med' | 'low'

/** Board-facing card status (matches the web columns). Distinct from RunStatus. */
export type CardStatus = 'ideas' | 'ready' | 'building' | 'review' | 'merged'

/** Canonical run statuses — match the board columns. */
export type RunStatus =
  | 'ready'
  | 'building'
  | 'needs_review'
  | 'merged'
  | 'interrupted'
  | 'failed'

/** Canonical step ids — match the prototype timeline. */
export type StepId = 'cloning' | 'planning' | 'editing' | 'testing' | 'pr'
export type StepState = 'pending' | 'active' | 'done'

export type DiffLineKind = 'ctx' | 'add' | 'del'

export interface DiffLine {
  t: DiffLineKind
  text: string
}

export interface DiffFile {
  file: string
  add: number
  del: number
  lines: DiffLine[]
}

export type ChatRole = 'agent' | 'user'

export interface ChatMessage {
  role: ChatRole
  text: string
  ts: number
}

export type MergeStrategy = 'pr' | 'merge'

/** A registered repo. Persisted in config.json. */
export interface AppRecord {
  id: string
  name: string
  repoSlug: string
  localPath: string
  defaultBranch: string
  /** What "Approve & merge" does for this repo. Falls back to the global config. */
  mergeStrategy?: MergeStrategy
}

/** Live git status, computed on demand (not persisted). */
export interface AppStatus extends AppRecord {
  cloned: boolean
  clean: boolean
  currentBranch: string | null
  ahead: number
  behind: number
  hasRemote: boolean
}

export interface RunStep {
  id: StepId
  state: StepState
}

export interface RunRecord {
  id: string
  appId: string
  cardId: string
  title?: string
  prompt: string
  type: CardType
  baseBranch: string
  branch: string
  worktreePath: string
  status: RunStatus
  progress: number
  steps: RunStep[]
  logs: string[]
  diff: DiffFile[]
  chat: ChatMessage[]
  createdAt: number
  updatedAt: number
  /** Codex conversation/session id for follow-up turns, when the CLI supports it. */
  sessionId?: string
  /** Pull request URL, set when approve opens a PR. */
  prUrl?: string
  error?: string
}

/**
 * A board card — the backlog item the user dispatches (spec §9 cards table).
 * When dispatched it links to a run via `runId`; build/diff/chat live on the run.
 */
export interface CardRecord {
  id: string
  appId: string
  type: CardType
  priority: Priority
  status: CardStatus
  title: string
  desc: string
  prompt: string
  runId?: string
  branch?: string
  mergedAt?: string
  /** Pull request URL when this card's run was approved via PR. */
  prUrl?: string
  createdAt: number
  updatedAt: number
}

// ---- Persisted state shape (~/.dispatch/state.json) ----
export interface PersistedState {
  runs: RunRecord[]
  cards: CardRecord[]
}

// ---- Persisted config (~/.dispatch/config.json) ----
export interface PersistedConfig {
  apps: AppRecord[]
  /** User-approved roots that localPath values must live under (path containment). */
  roots: string[]
  /** Per-app merge strategy: open a PR (gh) or fast-forward into defaultBranch. */
  mergeStrategy: 'pr' | 'merge'
  /** Max concurrent runs. */
  concurrency: number
}

// ---- WebSocket events (server → client) ----
export type ServerEvent =
  | { type: 'run.step'; runId: string; step: StepId; state: StepState }
  | { type: 'run.log'; runId: string; line: string; stream: 'stdout' | 'stderr' }
  | { type: 'run.progress'; runId: string; pct: number }
  | { type: 'run.diff'; runId: string; files: DiffFile[] }
  | { type: 'run.status'; runId: string; status: RunStatus }
  | { type: 'run.message'; runId: string; message: ChatMessage }
  | { type: 'card.update'; card: CardRecord }
  | { type: 'card.remove'; cardId: string }
  | { type: 'app.remove'; appId: string }
  | { type: 'agent.status'; online: boolean }

export interface HealthResponse {
  ok: boolean
  version: string
  codexVersion: string | null
  codexInstalled: boolean
  ghInstalled: boolean
  ghAuthed: boolean
}
