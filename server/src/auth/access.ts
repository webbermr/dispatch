import type { NextFunction, Request, Response } from 'express'
import { store } from '../store/jsonStore.js'
import type { Repo, Role, User, Workspace } from '../store/types.js'
import { userForToken } from './session.js'

const RANK: Record<Role, number> = { viewer: 0, builder: 1, admin: 2 }
export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min]
}

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined
}

/** Require a logged-in user; attaches `res.locals.user`. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = userForToken(bearer(req))
  if (!user) {
    res.status(401).json({ error: 'not signed in' })
    return
  }
  res.locals.user = user
  next()
}

export function currentUser(res: Response): User {
  return res.locals.user as User
}

/** The user's role in a workspace, or null if not a member. */
export function workspaceRole(userId: string, workspaceId: string): Role | null {
  return store.memberships.find((m) => m.workspaceId === workspaceId && m.userId === userId)?.role ?? null
}

export interface RepoAccess {
  repo: Repo
  workspace: Workspace
  role: Role
}

/** Resolve a repo + the user's role in its workspace, enforcing a minimum role. */
export function repoAccess(userId: string, repoId: string, min: Role): RepoAccess | { error: string; status: number } {
  const repo = store.repos.byId(repoId)
  if (!repo) return { error: 'unknown repo', status: 404 }
  const workspace = store.workspaces.byId(repo.workspaceId)
  if (!workspace) return { error: 'unknown workspace', status: 404 }
  const role = workspaceRole(userId, workspace.id)
  if (!role) return { error: 'not a member of this workspace', status: 403 }
  if (!roleAtLeast(role, min)) return { error: `requires ${min} role`, status: 403 }
  return { repo, workspace, role }
}

export function isAccessError(a: RepoAccess | { error: string; status: number }): a is { error: string; status: number } {
  return 'error' in a
}
