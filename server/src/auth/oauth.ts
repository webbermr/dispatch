import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, OAUTH_CALLBACK_BASE } from '../config.js'

export function githubConfigured(): boolean {
  return !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET)
}

export function githubAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${OAUTH_CALLBACK_BASE}/auth/github/callback`,
    scope: 'read:user user:email',
    state,
  })
  return `https://github.com/login/oauth/authorize?${p.toString()}`
}

interface GithubProfile {
  forgeUserId: string
  login: string
  name: string
  email?: string
  avatarUrl?: string
}

/** Exchange an OAuth code for a token and fetch the GitHub user profile. */
export async function githubExchange(code: string): Promise<GithubProfile> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
  })
  const tok = (await tokenRes.json()) as { access_token?: string; error_description?: string }
  if (!tok.access_token) throw new Error(tok.error_description || 'GitHub token exchange failed')

  const headers = { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'dispatch-server' }
  const user = (await (await fetch('https://api.github.com/user', { headers })).json()) as { id: number; login: string; name?: string; email?: string; avatar_url?: string }
  let email = user.email
  if (!email) {
    const emails = (await (await fetch('https://api.github.com/user/emails', { headers })).json()) as { email: string; primary: boolean; verified: boolean }[]
    email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email
  }
  return { forgeUserId: String(user.id), login: user.login, name: user.name || user.login, email, avatarUrl: user.avatar_url }
}
