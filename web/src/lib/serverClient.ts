// Typed client for the Dispatch control-plane server (multi-developer mode).
// Kept separate from agentClient so local single-user mode is untouched.

const URL_KEY = 'dispatch.server.url'
const TOKEN_KEY = 'dispatch.server.token'

export type Role = 'admin' | 'builder' | 'viewer'
export type CardType = 'feature' | 'bug' | 'enhancement'
export type Priority = 'high' | 'med' | 'low'
export type CardStatus = 'ideas' | 'ready' | 'building' | 'review' | 'merged'

export interface SUser { id: string; login: string; name: string; email?: string; avatarUrl?: string }
export interface SWorkspace { id: string; name: string; slug: string; role?: Role }
export interface SRepo { id: string; workspaceId: string; name: string; repoSlug: string; defaultBranch: string; forge: string; repoMode: 'local' | 'remote' }
export interface SCard {
  id: string
  repoId: string
  type: CardType
  priority: Priority
  status: CardStatus
  title: string
  desc: string
  prompt: string
  order: number
  scaffold?: boolean
  assigneeUserId?: string
  createdBy: string
  archived?: boolean
  createdAt: number
  updatedAt: number
}
export interface SComment { id: string; cardId: string; userId: string; text: string; createdAt: number }

export type ServerEvent =
  | { type: 'ready'; repoId: string }
  | { type: 'card.update'; repoId: string; card: SCard }
  | { type: 'card.remove'; repoId: string; cardId: string }
  | { type: 'comment.create'; repoId: string; cardId: string; comment: SComment }

export function defaultServerUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) || (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL || 'http://localhost:4400'
  } catch {
    return 'http://localhost:4400'
  }
}

export class ServerError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export class ServerClient {
  baseUrl: string

  constructor(baseUrl = defaultServerUrl()) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '')
    try {
      localStorage.setItem(URL_KEY, this.baseUrl)
    } catch {
      /* ignore */
    }
  }

  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  }
  setToken(t: string | null) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
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
        /* non-JSON */
      }
      throw new ServerError(res.status, msg)
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  methods(): Promise<{ devLogin: boolean; github: boolean }> {
    return this.req('/auth/methods')
  }
  async devLogin(email: string, name: string): Promise<SUser> {
    const { token, user } = await this.req<{ token: string; user: SUser }>('/auth/dev-login', { method: 'POST', body: JSON.stringify({ email, name }) })
    this.setToken(token)
    return user
  }
  me(): Promise<{ user: SUser }> {
    return this.req('/auth/me')
  }
  logout(): Promise<void> {
    const p = this.req<void>('/auth/logout', { method: 'POST' })
    this.setToken(null)
    return p
  }

  listWorkspaces(): Promise<{ workspaces: SWorkspace[] }> {
    return this.req('/workspaces')
  }
  createWorkspace(name: string): Promise<SWorkspace> {
    return this.req('/workspaces', { method: 'POST', body: JSON.stringify({ name }) })
  }
  listRepos(wsId: string): Promise<{ repos: SRepo[] }> {
    return this.req(`/workspaces/${wsId}/repos`)
  }
  createRepo(wsId: string, input: { name: string; repoSlug?: string; repoMode?: 'local' | 'remote' }): Promise<SRepo> {
    return this.req(`/workspaces/${wsId}/repos`, { method: 'POST', body: JSON.stringify(input) })
  }
  inviteMember(wsId: string, email: string, role: Role): Promise<{ user: SUser; role: Role }> {
    return this.req(`/workspaces/${wsId}/members`, { method: 'POST', body: JSON.stringify({ email, role }) })
  }

  listCards(repoId: string): Promise<{ cards: SCard[] }> {
    return this.req(`/repos/${repoId}/cards`)
  }
  createCard(repoId: string, input: { title: string; type?: CardType; prompt?: string; desc?: string }): Promise<SCard> {
    return this.req(`/repos/${repoId}/cards`, { method: 'POST', body: JSON.stringify(input) })
  }
  patchCard(id: string, patch: Partial<SCard>): Promise<SCard> {
    return this.req(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  }
  deleteCard(id: string): Promise<void> {
    return this.req(`/cards/${id}`, { method: 'DELETE' })
  }

  openStream(repoId: string, onEvent: (ev: ServerEvent) => void): WebSocket {
    const ws = new WebSocket(`${this.baseUrl.replace(/^http/, 'ws')}/stream?token=${encodeURIComponent(this.token ?? '')}&repoId=${encodeURIComponent(repoId)}`)
    ws.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data))
      } catch {
        /* ignore */
      }
    }
    return ws
  }
}

export const server = new ServerClient()
