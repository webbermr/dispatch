import { Router } from 'express'
import { appBuilder } from '../appBuilder.js'

/** AI app-builder: interview → spec. (Repo + cards are created via /apps + /cards.) */
export function builderRouter(): Router {
  const r = Router()

  // POST /builder/start — begin an interview; returns the AI's first question.
  r.post('/builder/start', async (_req, res) => {
    try {
      res.json(await appBuilder.start())
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /builder/:id/message — answer a question; returns the AI's next one.
  r.post('/builder/:id/message', async (req, res) => {
    const text = (req.body?.text ?? '').toString().trim()
    if (!text) return res.status(400).json({ error: 'text is required' })
    try {
      res.json(await appBuilder.message(req.params.id, text))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /builder/:id/plan — turn the interview into a first-iteration spec.
  r.post('/builder/:id/plan', async (req, res) => {
    try {
      res.json(await appBuilder.plan(req.params.id))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  return r
}
