import { Router } from 'express'
import { runManager } from '../runManager.js'
import type { CardType } from '../types.js'

const VALID_TYPES: CardType[] = ['feature', 'bug', 'enhancement']

export function runsRouter(): Router {
  const r = Router()

  // POST /runs — dispatch a card.
  r.post('/runs', async (req, res) => {
    const { appId, cardId, prompt, type, baseBranch, title } = req.body ?? {}
    if (!appId || !cardId || !prompt) {
      return res.status(400).json({ error: 'appId, cardId and prompt are required' })
    }
    const cardType: CardType = VALID_TYPES.includes(type) ? type : 'feature'
    try {
      const result = await runManager.dispatch({ appId, cardId, prompt, type: cardType, baseBranch, title })
      res.status(201).json(result)
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // GET /runs — all runs (for refresh-resume).
  r.get('/runs', (_req, res) => {
    res.json({ runs: runManager.list() })
  })

  // GET /runs/:id — full run state.
  r.get('/runs/:id', (req, res) => {
    const run = runManager.get(req.params.id)
    if (!run) return res.status(404).json({ error: 'unknown run' })
    res.json(run)
  })

  // POST /runs/:id/messages — follow-up chat (continues the Codex session).
  r.post('/runs/:id/messages', async (req, res) => {
    const text = (req.body?.text ?? '') as string
    if (!text.trim()) return res.status(400).json({ error: 'text is required' })
    try {
      res.json(await runManager.sendMessage(req.params.id, text))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /runs/:id/request-changes — re-run with feedback.
  r.post('/runs/:id/request-changes', async (req, res) => {
    try {
      res.json(await runManager.requestChanges(req.params.id, req.body?.feedback))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /runs/:id/approve — commit + PR/merge + cleanup.
  r.post('/runs/:id/approve', async (req, res) => {
    try {
      res.json(await runManager.approve(req.params.id))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /runs/:id/stop — kill the child, keep partial work.
  r.post('/runs/:id/stop', (req, res) => {
    try {
      res.json(runManager.stop(req.params.id))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  return r
}
