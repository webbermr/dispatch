import cors from 'cors'
import express, { type Express } from 'express'
import { authRouter } from './routes/auth.js'
import { cardsRouter } from './routes/cards.js'
import { reposRouter } from './routes/repos.js'
import { workspacesRouter } from './routes/workspaces.js'

export function buildApp(): Express {
  const app = express()
  app.use(cors({ origin: true }))
  app.use(express.json({ limit: '4mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'dispatch-server', version: '0.1.0' }))

  app.use('/', authRouter())
  app.use('/', workspacesRouter())
  app.use('/', reposRouter())
  app.use('/', cardsRouter())

  return app
}
