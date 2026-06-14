import { Router } from 'express'
import { loadConfig } from '../config.js'
import { probeAgents } from '../lib/agentRegistry.js'
import { openPath } from '../lib/open.js'
import { detectPreviewCommand, startPreview, stopPreview } from '../lib/preview.js'
import { runManager } from '../runManager.js'
import type { CardType, CodingAgentId } from '../types.js'

const VALID_TYPES: CardType[] = ['feature', 'bug', 'enhancement']

export function runsRouter(): Router {
  const r = Router()

  // POST /runs — dispatch a card (builds now, or queues it if at capacity).
  r.post('/runs', async (req, res) => {
    const { appId, cardId, prompt, type, baseBranch, title, model } = req.body ?? {}
    if (!appId || !cardId || !prompt) {
      return res.status(400).json({ error: 'appId, cardId and prompt are required' })
    }
    const cardType: CardType = VALID_TYPES.includes(type) ? type : 'feature'
    try {
      const result = await runManager.dispatch({ appId, cardId, prompt, type: cardType, baseBranch, title, model: typeof model === 'string' ? model : undefined })
      res.status(201).json(result)
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /runs/dispatch-ready — bulk-dispatch every Ready card in an app.
  r.post('/runs/dispatch-ready', async (req, res) => {
    const { appId } = req.body ?? {}
    if (!appId) return res.status(400).json({ error: 'appId is required' })
    try {
      res.json(await runManager.dispatchReady(appId))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // GET /queue — concurrency snapshot (cap, active runs, queued cards).
  r.get('/queue', (_req, res) => {
    res.json(runManager.queueInfo())
  })

  // POST /runs/race — build the card with every installed agent in parallel.
  r.post('/runs/race', async (req, res) => {
    const { appId, cardId, prompt, type, baseBranch, title, agents } = req.body ?? {}
    if (!appId || !cardId || !prompt) return res.status(400).json({ error: 'appId, cardId and prompt are required' })
    const cardType: CardType = VALID_TYPES.includes(type) ? type : 'feature'
    // Default to all installed agents; respect an explicit list if given.
    const installed = (await probeAgents()).filter((a) => a.installed).map((a) => a.id)
    let ids: CodingAgentId[] = Array.isArray(agents) && agents.length ? agents.filter((a: CodingAgentId) => installed.includes(a)) : installed
    ids = [...new Set(ids)]
    if (ids.length < 2) return res.status(400).json({ error: 'need at least two installed agents to race (install codex and claude)' })
    try {
      res.status(201).json(await runManager.race({ appId, cardId, prompt, type: cardType, baseBranch, title }, ids))
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

  // GET /runs/:id/checks — CI status for the run's pull request.
  r.get('/runs/:id/checks', async (req, res) => {
    try {
      res.json(await runManager.checksFor(req.params.id))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
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

  // POST /runs/:id/approve-plan — plan-first: accept the plan and implement it.
  r.post('/runs/:id/approve-plan', async (req, res) => {
    try {
      res.json(await runManager.approvePlan(req.params.id))
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /runs/:id/request-plan-changes — plan-first: re-plan with feedback.
  r.post('/runs/:id/request-plan-changes', async (req, res) => {
    try {
      res.json(await runManager.requestPlanChanges(req.params.id, req.body?.feedback))
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

  // POST /runs/:id/open — reveal the run's folder in the editor / file manager.
  r.post('/runs/:id/open', async (req, res) => {
    try {
      const path = runManager.folderFor(req.params.id)
      const opened = await openPath(path)
      res.json({ path, opened })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /runs/:id/preview — start a dev server in the run's worktree, return its URL.
  r.post('/runs/:id/preview', async (req, res) => {
    const run = runManager.get(req.params.id)
    if (!run) return res.status(404).json({ error: 'unknown run' })
    const app = loadConfig().apps.find((a) => a.id === run.appId)
    const override = typeof req.body?.command === 'string' ? req.body.command.trim() : ''
    const command = (override || app?.previewCommand?.trim() || detectPreviewCommand(run.worktreePath)) ?? ''
    if (!command) {
      return res.status(400).json({ error: 'no dev-server command found — set a Preview command for this repo (e.g. "npm run dev")' })
    }
    try {
      const result = await startPreview(run.worktreePath, command, app?.localPath)
      res.json({ command, ...result })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  // POST /runs/:id/preview/stop — stop the running preview.
  r.post('/runs/:id/preview/stop', (_req, res) => {
    stopPreview()
    res.json({ ok: true })
  })

  // POST /runs/:id/checkout — check the run's branch out in the user's own repo.
  r.post('/runs/:id/checkout', async (req, res) => {
    try {
      res.json(await runManager.checkoutBranch(req.params.id))
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
