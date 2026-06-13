import { Router } from 'express'
import { isOriginAllowed } from '../lib/security.js'
import type { PairingManager } from '../pairing.js'

export function pairRouter(pairing: PairingManager): Router {
  const r = Router()
  // Unauthenticated by design (this is how a client *gets* a token), but still
  // origin-checked so a random page can't redeem the code.
  r.post('/pair', (req, res) => {
    if (!isOriginAllowed(req.header('origin'))) {
      return res.status(403).json({ error: 'origin not allowed' })
    }
    const code = (req.body?.code ?? '') as string
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'missing pairing code' })
    }
    const result = pairing.redeem(code)
    if (!result.ok) return res.status(401).json({ error: result.error })
    res.json({ token: result.token })
  })
  return r
}
