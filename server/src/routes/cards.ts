import { Router } from 'express'
import { currentUser, isAccessError, repoAccess, requireAuth } from '../auth/access.js'
import { bus } from '../bus.js'
import { id } from '../ids.js'
import { store } from '../store/jsonStore.js'
import type { CardStatus, CardType, Priority } from '../store/types.js'

const TYPES: CardType[] = ['feature', 'bug', 'enhancement']
const PRIORITIES: Priority[] = ['high', 'med', 'low']
const STATUSES: CardStatus[] = ['ideas', 'ready', 'building', 'review', 'merged']

export function cardsRouter(): Router {
  const r = Router()
  r.use(requireAuth)

  // List a repo's cards.
  r.get('/repos/:id/cards', (req, res) => {
    const a = repoAccess(currentUser(res).id, req.params.id, 'viewer')
    if (isAccessError(a)) return res.status(a.status).json({ error: a.error })
    res.json({ cards: store.cards.where((c) => c.repoId === req.params.id) })
  })

  // Create a card (builder+).
  r.post('/repos/:id/cards', (req, res) => {
    const user = currentUser(res)
    const a = repoAccess(user.id, req.params.id, 'builder')
    if (isAccessError(a)) return res.status(a.status).json({ error: a.error })
    const { type, priority, title, desc, prompt, scaffold } = req.body ?? {}
    const now = Date.now()
    const card = store.cards.insert({
      id: id('card'),
      repoId: req.params.id,
      type: TYPES.includes(type) ? type : 'feature',
      priority: PRIORITIES.includes(priority) ? priority : 'med',
      status: 'ideas',
      title: typeof title === 'string' && title.trim() ? title.trim() : 'Untitled card',
      desc: typeof desc === 'string' ? desc : '',
      prompt: typeof prompt === 'string' ? prompt : '',
      scaffold: scaffold === true || undefined,
      order: now,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    bus.publish({ type: 'card.update', repoId: card.repoId, card })
    res.status(201).json(card)
  })

  // Edit / move a card (builder+).
  r.patch('/cards/:id', (req, res) => {
    const card = store.cards.byId(req.params.id)
    if (!card) return res.status(404).json({ error: 'unknown card' })
    const a = repoAccess(currentUser(res).id, card.repoId, 'builder')
    if (isAccessError(a)) return res.status(a.status).json({ error: a.error })
    const b = req.body ?? {}
    const patch: Record<string, unknown> = { updatedAt: Date.now() }
    if (typeof b.title === 'string') patch.title = b.title
    if (typeof b.desc === 'string') patch.desc = b.desc
    if (typeof b.prompt === 'string') patch.prompt = b.prompt
    if (TYPES.includes(b.type)) patch.type = b.type
    if (PRIORITIES.includes(b.priority)) patch.priority = b.priority
    if (STATUSES.includes(b.status)) patch.status = b.status
    if (typeof b.base === 'string') patch.base = b.base
    if (typeof b.model === 'string') patch.model = b.model
    if (typeof b.order === 'number' && Number.isFinite(b.order)) patch.order = b.order
    if (typeof b.scaffold === 'boolean') patch.scaffold = b.scaffold || undefined
    if (typeof b.archived === 'boolean') patch.archived = b.archived || undefined
    if (typeof b.assigneeUserId === 'string') patch.assigneeUserId = b.assigneeUserId || undefined
    const updated = store.cards.update(card.id, patch)!
    bus.publish({ type: 'card.update', repoId: updated.repoId, card: updated })
    res.json(updated)
  })

  // Delete a card (builder+).
  r.delete('/cards/:id', (req, res) => {
    const card = store.cards.byId(req.params.id)
    if (!card) return res.status(404).json({ error: 'unknown card' })
    const a = repoAccess(currentUser(res).id, card.repoId, 'builder')
    if (isAccessError(a)) return res.status(a.status).json({ error: a.error })
    store.comments.deleteWhere((c) => c.cardId === card.id)
    store.cards.delete(card.id)
    bus.publish({ type: 'card.remove', repoId: card.repoId, cardId: card.id })
    res.status(204).end()
  })

  // Comments — any member can read; any member can comment.
  r.get('/cards/:id/comments', (req, res) => {
    const card = store.cards.byId(req.params.id)
    if (!card) return res.status(404).json({ error: 'unknown card' })
    const a = repoAccess(currentUser(res).id, card.repoId, 'viewer')
    if (isAccessError(a)) return res.status(a.status).json({ error: a.error })
    res.json({ comments: store.comments.where((c) => c.cardId === card.id).sort((x, y) => x.createdAt - y.createdAt) })
  })

  r.post('/cards/:id/comments', (req, res) => {
    const user = currentUser(res)
    const card = store.cards.byId(req.params.id)
    if (!card) return res.status(404).json({ error: 'unknown card' })
    const a = repoAccess(user.id, card.repoId, 'viewer')
    if (isAccessError(a)) return res.status(a.status).json({ error: a.error })
    const text = (req.body?.text ?? '').toString().trim()
    if (!text) return res.status(400).json({ error: 'text is required' })
    const comment = store.comments.insert({ id: id('cmt'), cardId: card.id, userId: user.id, text, createdAt: Date.now() })
    bus.publish({ type: 'comment.create', repoId: card.repoId, cardId: card.id, comment })
    res.status(201).json(comment)
  })

  return r
}
