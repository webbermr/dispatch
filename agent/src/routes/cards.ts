import { Router } from 'express'
import { loadConfig } from '../config.js'
import { runManager } from '../runManager.js'
import type { CardStatus, CardType, Priority } from '../types.js'

const TYPES: CardType[] = ['feature', 'bug', 'enhancement']
const PRIORITIES: Priority[] = ['high', 'med', 'low']
const STATUSES: CardStatus[] = ['ideas', 'ready', 'building', 'review', 'merged']

export function cardsRouter(): Router {
  const r = Router()

  // GET /cards — all board cards (web filters by app).
  r.get('/cards', (_req, res) => {
    res.json({ cards: runManager.listCards() })
  })

  // POST /cards — create a backlog card.
  r.post('/cards', (req, res) => {
    const { appId, type, priority, title, desc, prompt } = req.body ?? {}
    if (!appId) return res.status(400).json({ error: 'appId is required' })
    if (!loadConfig().apps.some((a) => a.id === appId)) return res.status(400).json({ error: 'unknown app' })
    const card = runManager.createCard({
      appId,
      type: TYPES.includes(type) ? type : undefined,
      priority: PRIORITIES.includes(priority) ? priority : undefined,
      title,
      desc,
      prompt,
    })
    res.status(201).json(card)
  })

  // PATCH /cards/:id — edit fields or move between non-build columns.
  r.patch('/cards/:id', (req, res) => {
    const { title, desc, prompt, type, priority, status, base, order, model } = req.body ?? {}
    const patch: Record<string, unknown> = {}
    if (typeof title === 'string') patch.title = title
    if (typeof desc === 'string') patch.desc = desc
    if (typeof prompt === 'string') patch.prompt = prompt
    if (TYPES.includes(type)) patch.type = type
    if (PRIORITIES.includes(priority)) patch.priority = priority
    if (STATUSES.includes(status)) patch.status = status
    if (typeof base === 'string' && base.trim()) patch.base = base.trim()
    if (typeof order === 'number' && Number.isFinite(order)) patch.order = order
    if (typeof model === 'string') patch.model = model.trim() || undefined
    try {
      res.json(runManager.patchCard(req.params.id, patch))
    } catch (err) {
      res.status(404).json({ error: (err as Error).message })
    }
  })

  // POST /cards/:id/pick-winner — race: keep the chosen run, discard the rest.
  r.post('/cards/:id/pick-winner', async (req, res) => {
    const runId = (req.body?.runId ?? '') as string
    if (!runId) return res.status(400).json({ error: 'runId is required' })
    try {
      res.json(await runManager.pickWinner(req.params.id, runId))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /cards/:id/decompose — AI-split a big idea into scoped sub-cards (async).
  r.post('/cards/:id/decompose', async (req, res) => {
    try {
      await runManager.decompose(req.params.id)
      res.status(202).json({ ok: true })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /cards/:id/dequeue — pull a queued card back out of the build queue.
  r.post('/cards/:id/dequeue', (req, res) => {
    try {
      res.json(runManager.dequeue(req.params.id))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // DELETE /cards/:id — remove a backlog card (refused while it's building).
  r.delete('/cards/:id', (req, res) => {
    try {
      runManager.deleteCard(req.params.id)
      res.status(204).end()
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  return r
}
