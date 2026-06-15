import { Router } from 'express'
import { ALLOW_DEV_LOGIN } from '../config.js'
import { githubAuthUrl, githubConfigured, githubExchange } from '../auth/oauth.js'
import { issueToken, revokeToken, upsertUser } from '../auth/session.js'
import { currentUser, requireAuth } from '../auth/access.js'
import { id } from '../ids.js'

export function authRouter(): Router {
  const r = Router()

  // What sign-in methods are available (drives the web login screen).
  r.get('/auth/methods', (_req, res) => {
    res.json({ devLogin: ALLOW_DEV_LOGIN, github: githubConfigured() })
  })

  r.get('/auth/me', requireAuth, (_req, res) => {
    res.json({ user: currentUser(res) })
  })

  r.post('/auth/logout', (req, res) => {
    const h = req.headers.authorization
    if (h?.startsWith('Bearer ')) revokeToken(h.slice(7))
    res.json({ ok: true })
  })

  // Dev login (no password) — local development only.
  r.post('/auth/dev-login', (req, res) => {
    if (!ALLOW_DEV_LOGIN) return res.status(403).json({ error: 'dev login is disabled' })
    const { email, name, login } = req.body ?? {}
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email is required' })
    const user = upsertUser({ email: email.trim(), name: typeof name === 'string' ? name : undefined, login: (typeof login === 'string' && login) || email.split('@')[0] })
    res.json({ token: issueToken(user.id), user })
  })

  // GitHub OAuth (only when configured).
  r.get('/auth/github', (_req, res) => {
    if (!githubConfigured()) return res.status(400).json({ error: 'GitHub OAuth is not configured' })
    res.redirect(githubAuthUrl(id('state')))
  })

  r.get('/auth/github/callback', async (req, res) => {
    if (!githubConfigured()) return res.status(400).json({ error: 'GitHub OAuth is not configured' })
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    if (!code) return res.status(400).json({ error: 'missing code' })
    try {
      const p = await githubExchange(code)
      const user = upsertUser({ forge: 'github', forgeUserId: p.forgeUserId, login: p.login, name: p.name, email: p.email, avatarUrl: p.avatarUrl })
      res.json({ token: issueToken(user.id), user })
    } catch (err) {
      res.status(400).json({ error: (err as Error).message })
    }
  })

  return r
}
