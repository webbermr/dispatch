export type View = 'picker' | 'board'

export type CardType = 'feature' | 'bug' | 'enhancement'
export type Priority = 'high' | 'med' | 'low'
export type CardStatus = 'ideas' | 'ready' | 'building' | 'review' | 'merged'
export type DetailTab = 'diff' | 'chat'

export type AgentStatus = 'connected' | 'offline'

export type MergeStrategy = 'pr' | 'merge'
export type BuildLocation = 'worktree' | 'workdir'
export type Forge = 'github' | 'gitlab' | 'other'
export type CodingAgentId = 'codex' | 'claude'

export interface App {
  id: string
  name: string
  repo: string
  stack: string
  cloned: boolean
  base: string
  /** CSS color (token var or hex) used for the initials tile */
  accent: string
  /** What "Approve & merge" does for this repo (live mode). */
  mergeStrategy?: MergeStrategy
  /** Where builds run: isolated worktree (default) or the user's working copy. */
  buildLocation?: BuildLocation
  /** Which AI coding CLI builds cards for this repo. */
  agent?: CodingAgentId
  /** Propose a plan to approve before editing code. */
  planFirst?: boolean
  /** Auto-retry a failed build (fallback agent / fresh attempt). */
  autoRetry?: boolean
  /** Command that starts a dev server (for the review Preview button). */
  previewCommand?: string
  /** Whether the repo has a git remote (PR mode needs one). */
  hasRemote?: boolean
  /** Detected remote host (github/gitlab/other). */
  forge?: Forge
  /** Local branches usable as a build base. */
  branches?: string[]
}

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

export interface BuildState {
  progress: number
  currentStep: string
  logs: string[]
}

export type ChatRole = 'agent' | 'user'

export interface ChatMessage {
  role: ChatRole
  text: string
}

export interface Card {
  id: string
  appId: string
  type: CardType
  priority: Priority
  status: CardStatus
  title: string
  desc: string
  prompt?: string
  branch?: string
  /** Per-card base branch override (defaults to the repo's default branch). */
  base?: string
  /** Per-card model override within the repo's agent (empty = agent default). */
  model?: string
  /** Queued: dispatched but waiting for a free concurrency slot (no run yet). */
  queued?: boolean
  /** If split off a larger idea, the parent card's id. */
  parentId?: string
  /** Archived: a shipped card hidden from the board (still searchable). */
  archived?: boolean
  archivedAt?: number
  /** Manual sort order within a column (higher = nearer the top). */
  order?: number
  /** Linked agent run id (live mode only). */
  runId?: string
  build?: BuildState
  diff?: DiffFile[]
  chat?: ChatMessage[]
  mergedAt?: string
  /** Pull request URL, set when the card was approved via PR. */
  prUrl?: string
  /** Filesystem path of the build (isolated worktree, or the repo for workdir builds). */
  worktreePath?: string
  /** Which agent ran this card's build. */
  agentId?: CodingAgentId
  /** Plan-first: the proposed plan + whether it's awaiting approval. */
  phase?: 'plan_review' | 'build'
  plan?: string
  /** Race mode: the competing run ids (one per agent). */
  raceRunIds?: string[]
}

export interface CloneModalState {
  appId: string
  cardId: string | null
  appName: string
  repo: string
}
