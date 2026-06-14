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
/** Where a build runs: an isolated git worktree, or the user's own working copy. */
export type BuildLocation = 'worktree' | 'workdir'
export type Forge = 'github' | 'gitlab' | 'other'
/** Which AI coding CLI runs a build. */
export type CodingAgentId = 'codex' | 'claude'

/** A registered repo. Persisted in config.json. */
export interface AppRecord {
  id: string
  name: string
  repoSlug: string
  localPath: string
  defaultBranch: string
  /** What "Approve & merge" does for this repo. Falls back to the global config. */
  mergeStrategy?: MergeStrategy
  /** Where builds run for this repo (default: isolated worktree). */
  buildLocation?: BuildLocation
  /** Which AI coding CLI builds cards for this repo (default: codex). */
  agent?: CodingAgentId
  /** When true, the agent proposes a plan to approve before it edits code. */
  planFirst?: boolean
  /** When true, a failed build automatically retries (fallback agent / fresh attempt). */
  autoRetry?: boolean
  /** Command that starts a local dev server (for the review Preview button). */
  previewCommand?: string
}

/** Live git status, computed on demand (not persisted). */
export interface AppStatus extends AppRecord {
  cloned: boolean
  clean: boolean
  currentBranch: string | null
  ahead: number
  behind: number
  hasRemote: boolean
  /** Detected from the remote URL (github/gitlab/other). */
  forge: Forge
  /** Local branches that can be used as a build base. */
  branches: string[]
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
  /** Which agent ran this build (so follow-ups resume with the same one). */
  agentId?: CodingAgentId
  /** Specific model within the agent (empty/undefined = the agent's default). */
  model?: string
  /** 1-based attempt number; >1 means this run is an auto-retry/fallback. */
  attempt?: number
  /** If this run was auto-retried after failing, the id of the retry run. */
  retriedAs?: string
  /** If this run is an auto-retry, the id of the run it replaced. */
  retryOf?: string
  /** Agent conversation/session id for follow-up turns, when the CLI supports it. */
  sessionId?: string
  /** Pull request URL, set when approve opens a PR. */
  prUrl?: string
  /** Plan-first: the proposed plan awaiting approval, and which phase we're in. */
  phase?: 'plan_review' | 'build'
  plan?: string
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
  /** Per-card base branch override (defaults to the repo's default branch). */
  base?: string
  /** Per-card model override within the repo's agent (empty = agent default). */
  model?: string
  /** Manual sort order within a column (higher = nearer the top). */
  order?: number
  /** Queued: dispatched but waiting for a free concurrency slot (no run yet). */
  queued?: boolean
  /** If this card was split off a larger idea, the id of the parent card. */
  parentId?: string
  runId?: string
  branch?: string
  mergedAt?: string
  /** Pull request URL when this card's run was approved via PR. */
  prUrl?: string
  /** Race mode: the competing run ids (one per agent) while a card is raced. */
  raceRunIds?: string[]
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
  | { type: 'run.plan'; runId: string; plan: string }
  | { type: 'card.update'; card: CardRecord }
  | { type: 'card.remove'; cardId: string }
  | { type: 'app.remove'; appId: string }
  | { type: 'agent.status'; online: boolean }
  /** Build queue / concurrency snapshot (surfaces the cap + queued count). */
  | { type: 'queue.update'; concurrency: number; active: number; queued: number }
  /** A one-off notice for async ops (decompose, auto-retry) → a client toast. */
  | { type: 'notice'; level: 'info' | 'error'; message: string; appId?: string }

export interface CheckRunInfo {
  name: string
  state: string
  bucket: string
  link?: string
  workflow?: string
}

/** CI status for a card's PR (GitHub today; GitLab/other report 'unsupported'). */
export interface ChecksResult {
  forge: Forge
  prUrl: string | null
  state: 'success' | 'failure' | 'pending' | 'none' | 'unsupported'
  checks: CheckRunInfo[]
}

export interface HealthResponse {
  ok: boolean
  version: string
  codexVersion: string | null
  codexInstalled: boolean
  ghInstalled: boolean
  ghAuthed: boolean
  glabInstalled: boolean
  glabAuthed: boolean
  /** Max concurrent runs (the build-queue cap). */
  concurrency: number
  /** All known coding agents, whether each is installed, and their model menus. */
  agents: { id: CodingAgentId; label: string; installed: boolean; version: string | null; models: { id: string; label: string }[] }[]
}
