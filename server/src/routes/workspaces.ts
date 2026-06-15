import { Router } from 'express'
import { currentUser, requireAuth, roleAtLeast, workspaceRole } from '../auth/access.js'
import { upsertUser } from '../auth/session.js'
import { id, slugify } from '../ids.js'
import { store } from '../store/jsonStore.js'
import type { Role } from '../store/types.js'
import { randomBytes } from 'node:crypto'

const ROLES: Role[] = ['admin', 'builder', 'viewer']

export function workspacesRouter(): Router {
  const r = Router()
  r.use(requireAuth)

  // Create a workspace; the creator becomes its admin.
  r.post('/workspaces', (_req, res) => {
    const name = (_req.body?.name ?? '').toString().trim()
    if (!name) return res.status(400).json({ error: 'name is required' })
    const user = currentUser(res)
    const ws = store.workspaces.insert({ id: id('ws'), name, slug: slugify(name), ownerUserId: user.id, createdAt: Date.now() })
    store.memberships.insert({ id: id('m'), workspaceId: ws.id, userId: user.id, role: 'admin', createdAt: Date.now() })
    res.status(201).json(ws)
  })

  // Workspaces the current user belongs to.
  r.get('/workspaces', (_req, res) => {
    const user = currentUser(res)
    const mine = store.memberships.where((m) => m.userId === user.id)
    const workspaces = mine.map((m) => ({ ...store.workspaces.byId(m.workspaceId)!, role: m.role })).filter((w) => w.id)
    res.json({ workspaces })
  })

  // Workspace detail + members.
  r.get('/workspaces/:id', (req, res) => {
    const user = currentUser(res)
    const role = workspaceRole(user.id, req.params.id)
    if (!role) return res.status(403).json({ error: 'not a member' })
    const ws = store.workspaces.byId(req.params.id)
    if (!ws) return res.status(404).json({ error: 'unknown workspace' })
    const members = store.memberships
      .where((m) => m.workspaceId === ws.id)
      .map((m) => ({ role: m.role, user: store.users.byId(m.userId) }))
      .filter((m) => m.user)
    res.json({ workspace: ws, role, members })
  })

  // Invite/add a member (admin only). Dev-friendly: adds by email, creating a stub user.
  r.post('/workspaces/:id/members', (req, res) => {
    const user = currentUser(res)
    const role = workspaceRole(user.id, req.params.id)
    if (!role || !roleAtLeast(role, 'admin')) return res.status(403).json({ error: 'requires admin role' })
    const { email, name, role: newRole } = req.body ?? {}
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email is required' })
    const memberRole: Role = ROLES.includes(newRole) ? newRole : 'builder'
    const member = upsertUser({ email: email.trim(), name: typeof name === 'string' ? name : undefined, login: email.split('@')[0] })
    const existing = store.memberships.find((m) => m.workspaceId === req.params.id && m.userId === member.id)
    if (existing) {
      store.memberships.update(existing.id, { role: memberRole })
    } else {
      store.memberships.insert({ id: id('m'), workspaceId: req.params.id, userId: member.id, role: memberRole, createdAt: Date.now() })
    }
    res.status(201).json({ user: member, role: memberRole })
  })

  // Mint a runner token to pair a local agent with this workspace (builder+).
  r.post('/workspaces/:id/runner-tokens', (req, res) => {
    const user = currentUser(res)
    const role = workspaceRole(user.id, req.params.id)
    if (!role || !roleAtLeast(role, 'builder')) return res.status(403).json({ error: 'requires builder role' })
    const token = randomBytes(24).toString('hex')
    store.runnerTokens.insert({ id: token, token, workspaceId: req.params.id, userId: user.id, createdAt: Date.now() })
    res.status(201).json({ token })
  })

  return r
}
