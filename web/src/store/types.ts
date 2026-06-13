export type View = 'picker' | 'board'

export type CardType = 'feature' | 'bug' | 'enhancement'
export type Priority = 'high' | 'med' | 'low'
export type CardStatus = 'ideas' | 'ready' | 'building' | 'review' | 'merged'
export type DetailTab = 'diff' | 'chat'

export type AgentStatus = 'connected' | 'offline'

export type MergeStrategy = 'pr' | 'merge'

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
  /** Whether the repo has a git remote (PR mode needs one). */
  hasRemote?: boolean
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
  /** Linked agent run id (live mode only). */
  runId?: string
  build?: BuildState
  diff?: DiffFile[]
  chat?: ChatMessage[]
  mergedAt?: string
  /** Pull request URL, set when the card was approved via PR. */
  prUrl?: string
}

export interface CloneModalState {
  appId: string
  cardId: string | null
  appName: string
  repo: string
}
