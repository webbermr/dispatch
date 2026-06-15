import { randomBytes } from 'node:crypto'
import { store } from '../store/jsonStore.js'
import type { User } from '../store/types.js'

/** Issue an opaque bearer token bound to a user (stored server-side). */
export function issueToken(userId: string): string {
  const token = randomBytes(24).toString('hex')
  store.sessions.insert({ id: token, token, userId, createdAt: Date.now() })
  return token
}

export function userForToken(token: string | undefined): User | undefined {
  if (!token) return undefined
  const s = store.sessions.find((x) => x.token === token)
  return s ? store.users.byId(s.userId) : undefined
}

export function revokeToken(token: string): void {
  store.sessions.deleteWhere((s) => s.token === token)
}

/** Find-or-create a user by forge identity (or by email for dev login). */
export function upsertUser(input: { forge?: User['forge']; forgeUserId?: string; login: string; name?: string; email?: string; avatarUrl?: string }): User {
  const existing =
    (input.forge && input.forgeUserId && store.users.find((u) => u.forge === input.forge && u.forgeUserId === input.forgeUserId)) ||
    (input.email && store.users.find((u) => u.email === input.email)) ||
    store.users.find((u) => u.login === input.login)
  if (existing) {
    return store.users.update(existing.id, { name: input.name ?? existing.name, avatarUrl: input.avatarUrl ?? existing.avatarUrl, email: input.email ?? existing.email })!
  }
  return store.users.insert({
    id: `u_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
    forge: input.forge,
    forgeUserId: input.forgeUserId,
    login: input.login,
    name: input.name || input.login,
    email: input.email,
    avatarUrl: input.avatarUrl,
    createdAt: Date.now(),
  })
}
