import { homedir } from 'node:os'
import { join } from 'node:path'

export const PORT = Number(process.env.DISPATCH_SERVER_PORT || 4400)
export const HOST = process.env.DISPATCH_SERVER_HOST || '0.0.0.0'

const HOME = process.env.DISPATCH_SERVER_HOME || join(homedir(), '.dispatch-server')
export const DATA_PATH = join(HOME, 'data.json')

/** Secret used to sign session tokens (set a stable value in production). */
export const SESSION_SECRET = process.env.DISPATCH_SESSION_SECRET || 'dev-insecure-secret-change-me'

/** Dev login (email/name, no password) — for local development only. Disable in prod. */
export const ALLOW_DEV_LOGIN = process.env.DISPATCH_ALLOW_DEV_LOGIN !== '0'

/** GitHub OAuth (optional). When unset, only dev login is available. */
export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''
export const OAUTH_CALLBACK_BASE = process.env.DISPATCH_OAUTH_CALLBACK_BASE || `http://localhost:${PORT}`
