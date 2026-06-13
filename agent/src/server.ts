import cors from 'cors'
import express from 'express'
import { createServer, type Server } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { HOST, PORT } from './config.js'
import { log } from './lib/log.js'
import { allowedOrigins, requireAuth } from './lib/security.js'
import type { PairingManager } from './pairing.js'
import { appsRouter } from './routes/apps.js'
import { cardsRouter } from './routes/cards.js'
import { healthRouter } from './routes/health.js'
import { pairRouter } from './routes/pair.js'
import { runsRouter } from './routes/runs.js'
import { attachWebSocket } from './wsServer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Path to the built web bundle the agent serves same-origin (spec §8.4). */
function webBundleDir(): string | null {
  const candidates = [
    process.env.DISPATCH_WEB_DIR,
    join(__dirname, '..', 'web'), // bundled into the published package
    join(__dirname, '..', '..', 'web', 'dist'), // monorepo dev layout
  ].filter(Boolean) as string[]
  return candidates.find((p) => existsSync(join(p, 'index.html'))) ?? null
}

export function buildServer(pairing: PairingManager): Server {
  const app = express()
  app.use(express.json({ limit: '4mb' }))
  app.use(
    cors({
      origin: allowedOrigins(),
      credentials: false,
    }),
  )

  // Public endpoints (origin-checked, but no token required).
  app.use('/', healthRouter())
  app.use('/', pairRouter(pairing))

  // The API surface requires a paired token. Scope auth to these prefixes only,
  // so it never intercepts the static bundle / SPA routes (which fall through
  // to express.static below).
  const API_PREFIXES = ['/apps', '/cards', '/runs']
  const auth = requireAuth(pairing)
  app.use((req, res, next) => {
    if (API_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + '/'))) return auth(req, res, next)
    next()
  })
  app.use('/', appsRouter())
  app.use('/', cardsRouter())
  app.use('/', runsRouter())

  // Serve the web bundle same-origin, if present.
  const bundle = webBundleDir()
  if (bundle) {
    log.info('serving web bundle from', bundle)
    app.use(express.static(bundle))
    app.get('*', (_req, res) => res.sendFile(join(bundle, 'index.html')))
  } else {
    log.warn('no web bundle found — running API-only. Build web/ and set DISPATCH_WEB_DIR to serve the UI.')
  }

  const server = createServer(app)
  attachWebSocket(server, pairing)
  return server
}

export function listen(server: Server): Promise<void> {
  return new Promise((resolve) => {
    // Bind loopback only — never a routable interface (spec §8.3).
    server.listen(PORT, HOST, () => {
      log.info(`dispatch-agent listening on http://${HOST}:${PORT}`)
      resolve()
    })
  })
}
