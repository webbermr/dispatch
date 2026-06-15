import { Router } from 'express'
import { currentUser, isAccessError, repoAccess, requireAuth, workspaceRole, roleAtLeast } from '../auth/access.js'
import { id } from '../ids.js'
import { store } from '../store/jsonStore.js'
import type { Forge, RepoMode } from '../store/types.js'

const FORGES: Forge[] = ['github', 'gitlab', 'other']

export function reposRouter(): Router {
  const r = Router()
  r.use(requireAuth)

  // Repos in a workspace.
  r.get('/workspaces/:wid/repos', (req, res) => {
    const user = currentUser(res)
    if (!workspaceRole(user.id, req.params.wid)) return res.status(403).json({ error: 'not a member' })
    res.json({ repos: store.repos.where((x) => x.workspaceId === req.params.wid) })
  })

  // Add a repo to a workspace (builder+).
  r.post('/workspaces/:wid/repos', (req, res) => {
    const user = currentUser(res)
    const role = workspaceRole(user.id, req.params.wid)
    if (!role || !roleAtLeast(role, 'builder')) return res.status(403).json({ error: 'requires builder role' })
    const { name, repoSlug, defaultBranch, forge, repoMode, settings } = req.body ?? {}
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' })
    const repo = store.repos.insert({
      id: id('repo'),
      workspaceId: req.params.wid,
      name: name.trim(),
      repoSlug: typeof repoSlug === 'string' ? repoSlug.trim() : '',
      defaultBranch: typeof defaultBranch === 'string' && defaultBranch.trim() ? defaultBranch.trim() : 'main',
      forge: FORGES.includes(forge) ? forge : 'other',
      repoMode: (repoMode === 'local' || repoMode === 'remote' ? repoMode : repoSlug ? 'remote' : 'local') as RepoMode,
      settings: typeof settings === 'object' && settings ? settings : undefined,
      createdAt: Date.now(),
    })
    res.status(201).json(repo)
  })

  r.get('/repos/:id', (req, res) => {
    const user = currentUser(res)
    const a = repoAccess(user.id, req.params.id, 'viewer')
    if (isAccessError(a)) return res.status(a.status).json({ error: a.error })
    res.json({ repo: a.repo, role: a.role })
  })

  // Update repo settings / mode / name (admin).
  r.patch('/repos/:id', (req, res) => {
    const user = currentUser(res)
    const a = repoAccess(user.id, req.params.id, 'admin')
    if (isAccessError(a)) return res.status(a.status).json({ error: a.error })
    const { name, repoMode, settings, defaultBranch } = req.body ?? {}
    const patch: Record<string, unknown> = {}
    if (typeof name === 'string' && name.trim()) patch.name = name.trim()
    if (repoMode === 'local' || repoMode === 'remote') patch.repoMode = repoMode
    if (typeof defaultBranch === 'string' && defaultBranch.trim()) patch.defaultBranch = defaultBranch.trim()
    if (typeof settings === 'object' && settings) patch.settings = { ...a.repo.settings, ...settings }
    res.json(store.repos.update(a.repo.id, patch))
  })

  return r
}
