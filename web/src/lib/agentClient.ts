// Typed client for the local Dispatch agent (REST + WebSocket, spec §4).
// All agent network I/O lives here so the store stays transport-agnostic.

import type { CardType, Priority } from '../store/types'

const TOKEN_KEY = 'dispatch.token'

/** Where the agent lives. Same-origin when the agent serves the bundle (port
 *  4317); otherwise the loopback default (e.g. during Vite dev on 5180). */
function resolveBaseUrl(): string {
  const env = (import.meta as { env?: Record<string, string> }).env?.VITE_AGENT_URL
  if (env) return env.replace(/\/$/, '')
  if (typeof location !== 'undefined' && location.port === '4317') return location.origin
  return 'http://127.0.0.1:4317'
}

// ---- Agent-shaped payloads (mirror agent/src/types.ts) ----
export interface AgentHealth {
  ok: boolean
  version: string
  codexVersion: string | null
  codexInstalled: boolean
  ghInstalled: boolean
  ghAuthed: boolean
  glabInstalled: boolean
  glabAuthed: boolean
  concurrency: number
  agents: { id: CodingAgentId; label: string; installed: boolean; version: string | null; models: { id: string; label: string }[] }[]
}

export type MergeStrategy = 'pr' | 'merge'
export type BuildLocation = 'worktree' | 'workdir'
export type Forge = 'github' | 'gitlab' | 'other'
export type CodingAgentId = 'codex' | 'claude'

export interface AgentApp {
  id: string
  name: string
  repoSlug: string
  localPath: string
  defaultBranch: string
  mergeStrategy?: MergeStrategy
  buildLocation?: BuildLocation
  agent?: CodingAgentId
  planFirst?: boolean
  autoRetry?: boolean
  previewCommand?: string
  repoMode?: 'local' | 'remote'
  cloned: boolean
  clean: boolean
  currentBranch: string | null
  ahead: number
  behind: number
  hasRemote: boolean
  forge: Forge
  branches: string[]
}

export type AgentCardStatus = 'ideas' | 'ready' | 'building' | 'review' | 'merged'

export interface AgentCard {
  id: string
  appId: string
  type: CardType
  priority: Priority
  status: AgentCardStatus
  title: string
  desc: string
  prompt: string
  base?: string
  model?: string
  order?: number
  queued?: boolean
  parentId?: string
  scaffold?: boolean
  blocked?: boolean
  archived?: boolean
  archivedAt?: number
  raceRunIds?: string[]
  runId?: string
  branch?: string
  mergedAt?: string
  prUrl?: string
  createdAt: number
  updatedAt: number
}

export type AgentRunStatus = 'ready' | 'building' | 'needs_review' | 'merged' | 'interrupted' | 'failed'

export interface AgentDiffFile {
  file: string
  add: number
  del: number
  lines: { t: 'ctx' | 'add' | 'del'; text: string }[]
}

export interface AgentRun {
  id: string
  appId: string
  cardId: string
  branch: string
  status: AgentRunStatus
  progress: number
  steps: { id: string; state: 'pending' | 'active' | 'done' }[]
  logs: string[]
  diff: AgentDiffFile[]
  chat: { role: 'agent' | 'user'; text: string; ts: number }[]
  prUrl?: string
  worktreePath?: string
  agentId?: CodingAgentId
  model?: string
  attempt?: number
  retryOf?: string
  retriedAs?: string
  phase?: 'plan_review' | 'build'
  plan?: string
  error?: string
  createdAt?: number
  updatedAt?: number
}

export interface RepoDiagnosis {
  level: 'ok' | 'warn' | 'error'
  message: string
  steps: string[]
  details: {
    exists: boolean
    isGitRepo: boolean
    hasCommits: boolean
    remoteUrl: string | null
    host: string | null
    remoteReachable: boolean | null
  }
}

export interface CheckRunInfo {
  name: string
  state: string
  bucket: string
  link?: string
  workflow?: string
}

export interface ChecksResult {
  forge: Forge
  prUrl: string | null
  state: 'success' | 'failure' | 'pending' | 'none' | 'unsupported'
  checks: CheckRunInfo[]
}

export interface AgentMetricRow {
  agentId: CodingAgentId
  model: string
  total: number
  success: number
  failed: number
  avgMs: number | null
}

export interface MetricsResult {
  totals: { total: number; success: number; failed: number; avgMs: number | null }
  byAgent: AgentMetricRow[]
}

export interface BuilderCard {
  title: string
  type: CardType
  prompt: string
  scaffold?: boolean
}

export interface BuilderPlan {
  name: string
  summary: string
  repoSlug: string
  cards: BuilderCard[]
}

export type ServerEvent =
  | { type: 'run.step'; runId: string; step: string; state: 'pending' | 'active' | 'done' }
  | { type: 'run.log'; runId: string; line: string; stream: 'stdout' | 'stderr' }
  | { type: 'run.progress'; runId: string; pct: number }
  | { type: 'run.diff'; runId: string; files: AgentDiffFile[] }
  | { type: 'run.status'; runId: string; status: AgentRunStatus }
  | { type: 'run.message'; runId: string; message: { role: 'agent' | 'user'; text: string; ts: number } }
  | { type: 'run.plan'; runId: string; plan: string }
  | { type: 'card.update'; card: AgentCard }
  | { type: 'card.remove'; cardId: string }
  | { type: 'app.remove'; appId: string }
  | { type: 'agent.status'; online: boolean }
  | { type: 'queue.update'; concurrency: number; active: number; queued: number }
  | { type: 'notice'; level: 'info' | 'error'; message: string; appId?: string; cardId?: string }
  | { type: 'chat.message'; appId: string; message: { role: 'agent' | 'user'; text: string; ts: number } }
  | { type: 'chat.status'; appId: string; thinking: boolean; note?: string }

export class AgentError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export class AgentClient {
  readonly baseUrl: string

  constructor(baseUrl = resolveBaseUrl()) {
    this.baseUrl = baseUrl
  }

  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  }

  setToken(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore storage failures (private mode, etc.) */
    }
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
    if (init.body) headers['content-type'] = 'application/json'
    if (this.token) headers['authorization'] = `Bearer ${this.token}`
    const res = await fetch(this.baseUrl + path, { ...init, headers })
    if (!res.ok) {
      let msg = res.statusText
      try {
        msg = (await res.json())?.error ?? msg
      } catch {
        /* non-JSON error body */
      }
      throw new AgentError(res.status, msg)
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  // ---- public (no token) ----
  health(): Promise<AgentHealth> {
    return this.req<AgentHealth>('/health')
  }

  async pair(code: string): Promise<string> {
    const { token } = await this.req<{ token: string }>('/pair', { method: 'POST', body: JSON.stringify({ code }) })
    this.setToken(token)
    return token
  }

  // ---- apps ----
  listApps(): Promise<{ apps: AgentApp[] }> {
    return this.req('/apps')
  }
  getApp(id: string): Promise<AgentApp> {
    return this.req(`/apps/${id}`)
  }
  registerApp(input: { localPath: string; name?: string; repoMode?: 'local' | 'remote' }): Promise<AgentApp> {
    return this.req('/apps', { method: 'POST', body: JSON.stringify(input) })
  }
  cloneNewRepo(input: { repoUrl: string; parentDir: string; name?: string }): Promise<AgentApp> {
    return this.req('/apps/clone-url', { method: 'POST', body: JSON.stringify(input) })
  }
  initLocalRepo(input: { parentDir: string; slug: string; name?: string }): Promise<AgentApp> {
    return this.req('/apps/init-local', { method: 'POST', body: JSON.stringify(input) })
  }
  createRemoteRepo(input: { parentDir: string; slug: string; name?: string; private?: boolean }): Promise<AgentApp> {
    return this.req('/apps/create-remote', { method: 'POST', body: JSON.stringify(input) })
  }
  builderStart(): Promise<{ id: string; message: string }> {
    return this.req('/builder/start', { method: 'POST' })
  }
  builderMessage(id: string, text: string): Promise<{ message: string }> {
    return this.req(`/builder/${id}/message`, { method: 'POST', body: JSON.stringify({ text }) })
  }
  builderPlan(id: string): Promise<BuilderPlan> {
    return this.req(`/builder/${id}/plan`, { method: 'POST' })
  }
  generateAgentsMd(id: string, force = false): Promise<{ path: string; bytes: number; overwritten: boolean }> {
    return this.req(`/apps/${id}/agents-md`, { method: 'POST', body: JSON.stringify({ force }) })
  }
  getChat(id: string): Promise<{ messages: { role: 'agent' | 'user'; text: string; ts: number }[]; thinking: boolean }> {
    return this.req(`/apps/${id}/chat`)
  }
  ask(id: string, text: string): Promise<{ ok: boolean }> {
    return this.req(`/apps/${id}/ask`, { method: 'POST', body: JSON.stringify({ text }) })
  }
  clearChat(id: string): Promise<{ ok: boolean }> {
    return this.req(`/apps/${id}/chat/clear`, { method: 'POST' })
  }
  diagnose(localPath: string): Promise<RepoDiagnosis> {
    return this.req('/apps/diagnose', { method: 'POST', body: JSON.stringify({ localPath }) })
  }
  removeApp(id: string): Promise<void> {
    return this.req(`/apps/${id}`, { method: 'DELETE' })
  }
  updateApp(id: string, patch: { mergeStrategy?: MergeStrategy; buildLocation?: BuildLocation; agent?: CodingAgentId; planFirst?: boolean; autoRetry?: boolean; previewCommand?: string; repoMode?: 'local' | 'remote'; name?: string }): Promise<AgentApp> {
    return this.req(`/apps/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
  clone(id: string): Promise<AgentApp> {
    return this.req(`/apps/${id}/clone`, { method: 'POST' })
  }
  pull(id: string): Promise<{ summary: string; status: AgentApp }> {
    return this.req(`/apps/${id}/pull`, { method: 'POST' })
  }

  // ---- cards ----
  listCards(): Promise<{ cards: AgentCard[] }> {
    return this.req('/cards')
  }
  createCard(input: Partial<AgentCard> & { appId: string }): Promise<AgentCard> {
    return this.req('/cards', { method: 'POST', body: JSON.stringify(input) })
  }
  patchCard(id: string, patch: Partial<AgentCard>): Promise<AgentCard> {
    return this.req(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
  deleteCard(id: string): Promise<void> {
    return this.req(`/cards/${id}`, { method: 'DELETE' })
  }
  cardRuns(id: string): Promise<{ runs: AgentRun[] }> {
    return this.req(`/cards/${id}/runs`)
  }
  archiveCard(id: string): Promise<AgentCard> {
    return this.req(`/cards/${id}/archive`, { method: 'POST' })
  }
  unarchiveCard(id: string): Promise<AgentCard> {
    return this.req(`/cards/${id}/unarchive`, { method: 'POST' })
  }
  archiveMerged(appId: string): Promise<{ archived: number }> {
    return this.req(`/apps/${appId}/archive-merged`, { method: 'POST' })
  }
  metrics(appId?: string): Promise<MetricsResult> {
    return this.req(`/metrics${appId ? `?appId=${encodeURIComponent(appId)}` : ''}`)
  }

  // ---- runs ----
  listRuns(): Promise<{ runs: AgentRun[] }> {
    return this.req('/runs')
  }
  getRun(id: string): Promise<AgentRun> {
    return this.req(`/runs/${id}`)
  }
  checks(id: string): Promise<ChecksResult> {
    return this.req(`/runs/${id}/checks`)
  }
  dispatch(body: { appId: string; cardId: string; prompt: string; type: CardType; baseBranch?: string; title?: string; model?: string }): Promise<{ runId: string; branch: string; agentId: CodingAgentId } | { queued: true; agentId: CodingAgentId } | { blocked: true; scaffoldTitle: string }> {
    return this.req('/runs', { method: 'POST', body: JSON.stringify(body) })
  }
  dispatchReady(appId: string): Promise<{ started: number; queued: number }> {
    return this.req('/runs/dispatch-ready', { method: 'POST', body: JSON.stringify({ appId }) })
  }
  queue(): Promise<{ concurrency: number; active: number; queued: number }> {
    return this.req('/queue')
  }
  decompose(cardId: string, count?: number): Promise<{ ok: boolean }> {
    return this.req(`/cards/${cardId}/decompose`, { method: 'POST', body: JSON.stringify({ count }) })
  }
  dequeue(cardId: string): Promise<AgentCard> {
    return this.req(`/cards/${cardId}/dequeue`, { method: 'POST' })
  }
  race(body: { appId: string; cardId: string; prompt: string; type: CardType; baseBranch?: string; title?: string }): Promise<{ runIds: string[] }> {
    return this.req('/runs/race', { method: 'POST', body: JSON.stringify(body) })
  }
  approvePlan(id: string): Promise<AgentRun> {
    return this.req(`/runs/${id}/approve-plan`, { method: 'POST' })
  }
  requestPlanChanges(id: string, feedback?: string): Promise<AgentRun> {
    return this.req(`/runs/${id}/request-plan-changes`, { method: 'POST', body: JSON.stringify({ feedback }) })
  }
  pickWinner(cardId: string, runId: string): Promise<AgentCard> {
    return this.req(`/cards/${cardId}/pick-winner`, { method: 'POST', body: JSON.stringify({ runId }) })
  }
  preview(id: string, command?: string): Promise<{ command: string; url: string | null; logs: string[] }> {
    return this.req(`/runs/${id}/preview`, { method: 'POST', body: JSON.stringify({ command }) })
  }
  stopPreview(id: string): Promise<{ ok: boolean }> {
    return this.req(`/runs/${id}/preview/stop`, { method: 'POST' })
  }
  sendMessage(id: string, text: string): Promise<AgentRun> {
    return this.req(`/runs/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) })
  }
  requestChanges(id: string, feedback?: string): Promise<AgentRun> {
    return this.req(`/runs/${id}/request-changes`, { method: 'POST', body: JSON.stringify({ feedback }) })
  }
  approve(id: string): Promise<AgentRun> {
    return this.req(`/runs/${id}/approve`, { method: 'POST' })
  }
  stop(id: string): Promise<AgentRun> {
    return this.req(`/runs/${id}/stop`, { method: 'POST' })
  }
  openRun(id: string): Promise<{ path: string; opened: string | null }> {
    return this.req(`/runs/${id}/open`, { method: 'POST' })
  }
  checkoutRun(id: string): Promise<{ branch: string; path: string }> {
    return this.req(`/runs/${id}/checkout`, { method: 'POST' })
  }

  /** Open the streaming socket and subscribe to all runs. */
  openStream(onEvent: (ev: ServerEvent) => void, onClose?: () => void): WebSocket {
    const wsBase = this.baseUrl.replace(/^http/, 'ws')
    const ws = new WebSocket(`${wsBase}/stream?token=${encodeURIComponent(this.token ?? '')}`)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', runId: '*' }))
    ws.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data))
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = () => onClose?.()
    return ws
  }
}

export const agent = new AgentClient()
