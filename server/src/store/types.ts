// Shared-board data model (control plane). Mirrors agent/web card concepts but is
// multi-tenant: everything hangs off a workspace the user is a member of.

export type Role = 'admin' | 'builder' | 'viewer'
export type Forge = 'github' | 'gitlab' | 'other'
export type CardType = 'feature' | 'bug' | 'enhancement'
export type Priority = 'high' | 'med' | 'low'
export type CardStatus = 'ideas' | 'ready' | 'building' | 'review' | 'merged'
export type RepoMode = 'local' | 'remote'

export interface User {
  id: string
  forge?: Forge
  forgeUserId?: string
  login: string
  name: string
  email?: string
  avatarUrl?: string
  createdAt: number
}

export interface Workspace {
  id: string
  name: string
  slug: string
  ownerUserId: string
  createdAt: number
}

export interface Membership {
  id: string
  workspaceId: string
  userId: string
  role: Role
  createdAt: number
}

export interface Repo {
  id: string
  workspaceId: string
  name: string
  repoSlug: string
  defaultBranch: string
  forge: Forge
  repoMode: RepoMode
  /** Per-repo agent/build defaults (mirror the local app settings). */
  settings?: { agent?: string; planFirst?: boolean; autoRetry?: boolean; mergeStrategy?: string; previewCommand?: string }
  createdAt: number
}

export interface Card {
  id: string
  repoId: string
  type: CardType
  priority: Priority
  status: CardStatus
  title: string
  desc: string
  prompt: string
  base?: string
  model?: string
  order: number
  scaffold?: boolean
  parentId?: string
  assigneeUserId?: string
  /** The latest run building/built for this card (server-side run id). */
  runId?: string
  createdBy: string
  archived?: boolean
  createdAt: number
  updatedAt: number
}

export interface Comment {
  id: string
  cardId: string
  userId: string
  text: string
  createdAt: number
}

export interface Session {
  id: string // equals token (collections are keyed by id)
  token: string
  userId: string
  createdAt: number
}

/** A long-lived token a member pairs their local agent (runner) with. */
export interface RunnerToken {
  id: string // equals the token value
  token: string
  workspaceId: string
  userId: string
  createdAt: number
}

export type RunStatus = 'building' | 'needs_review' | 'merged' | 'failed' | 'interrupted' | 'ready'
export interface RunStep {
  id: string
  state: 'pending' | 'active' | 'done'
}
export interface DiffLine {
  t: 'ctx' | 'add' | 'del'
  text: string
}
export interface DiffFile {
  file: string
  add: number
  del: number
  lines: DiffLine[]
}
export interface RunChatMsg {
  role: 'agent' | 'user'
  text: string
  ts: number
}

/** A build executed on a runner (a developer's machine), reported to the board. */
export interface Run {
  id: string
  repoId: string
  workspaceId: string
  cardId: string
  userId: string // who dispatched it (whose machine runs it)
  runnerName?: string
  agentId?: string
  model?: string
  status: RunStatus
  progress: number
  steps: RunStep[]
  branch?: string
  prUrl?: string
  error?: string
  logs: string[]
  diff: DiffFile[]
  chat: RunChatMsg[]
  createdAt: number
  updatedAt: number
}

export interface Db {
  users: User[]
  workspaces: Workspace[]
  memberships: Membership[]
  repos: Repo[]
  cards: Card[]
  comments: Comment[]
  sessions: Session[]
  runnerTokens: RunnerToken[]
  runs: Run[]
}

export const EMPTY_DB: Db = { users: [], workspaces: [], memberships: [], repos: [], cards: [], comments: [], sessions: [], runnerTokens: [], runs: [] }
