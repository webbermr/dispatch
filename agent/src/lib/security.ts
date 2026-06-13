import type { NextFunction, Request, Response } from 'express'
import { PORT } from '../config.js'
import type { PairingManager } from '../pairing.js'

/**
 * Allowed page origins (spec §8.2). The agent serves the bundle same-origin, so
 * loopback is always allowed; a deployed web host can be added via
 * DISPATCH_WEB_ORIGIN, and the Vite dev server is allowed for local development.
 */
export function allowedOrigins(): string[] {
  const set = new Set<string>([
    `http://127.0.0.1:${PORT}`,
    `http://localhost:${PORT}`,
    'http://localhost:5180',
    'http://127.0.0.1:5180',
  ])
  if (process.env.DISPATCH_WEB_ORIGIN) set.add(process.env.DISPATCH_WEB_ORIGIN)
  return [...set]
}

export function isOriginAllowed(origin: string | undefined): boolean {
  // Same-origin / curl / native fetch may omit Origin — allow only from loopback,
  // which is enforced separately by binding to 127.0.0.1.
  if (!origin) return true
  return allowedOrigins().includes(origin)
}

export function bearerToken(req: Request): string | undefined {
  const h = req.header('authorization')
  if (h?.startsWith('Bearer ')) return h.slice('Bearer '.length).trim()
  return undefined
}

/** Express middleware: require a valid paired token + an allowed Origin. */
export function requireAuth(pairing: PairingManager) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isOriginAllowed(req.header('origin'))) {
      return res.status(403).json({ error: 'origin not allowed' })
    }
    if (!pairing.isValid(bearerToken(req))) {
      return res.status(401).json({ error: 'unpaired — POST /pair with your code first' })
    }
    next()
  }
}
