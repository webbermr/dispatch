import { run } from './git.js'

const GH = process.env.DISPATCH_GH_BIN || 'gh'

export async function ghInstalled(): Promise<boolean> {
  return (await run(GH, ['--version'])).code === 0
}

export async function ghAuthed(): Promise<boolean> {
  return (await run(GH, ['auth', 'status'], { env: { GH_PROMPT_DISABLED: '1' } })).code === 0
}

/**
 * Open a pull request for `head` → `base` from within `cwd`, returning its URL.
 * If a PR already exists for the branch, returns that one. Never prompts.
 */
export async function ghCreatePr(
  cwd: string,
  head: string,
  base: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const r = await run(GH, ['pr', 'create', '--head', head, '--base', base, '--fill'], {
    cwd,
    timeoutMs: 30000,
    env: { GH_PROMPT_DISABLED: '1' },
  })
  if (r.code === 0) {
    const url = r.stdout.match(/https?:\/\/\S+/)?.[0] ?? r.stdout.trim()
    return { ok: true, url }
  }
  // gh reports an existing PR on stderr: "a pull request for branch … already exists: <url>"
  const existing = r.stderr.match(/already exists:\s*(\S+)/)?.[1]
  if (existing) return { ok: true, url: existing }
  const error = (r.stderr || r.stdout).trim().split('\n').filter(Boolean).slice(-2).join(' ')
  return { ok: false, error: error || `gh pr create exited ${r.code}` }
}

export interface CheckRun {
  name: string
  state: string
  bucket: string
  link?: string
  workflow?: string
}

/**
 * List a PR's CI checks via `gh pr checks <url> --json …`. gh exits non-zero
 * when checks are pending or failing, so we parse stdout regardless of code.
 * Returns [] when no checks are configured.
 */
export async function ghChecks(cwd: string, prUrl: string): Promise<CheckRun[]> {
  const r = await run(GH, ['pr', 'checks', prUrl, '--json', 'name,state,bucket,link,workflow'], {
    cwd,
    timeoutMs: 20000,
    env: { GH_PROMPT_DISABLED: '1' },
  })
  const txt = r.stdout.trim()
  if (!txt || txt[0] !== '[') return []
  try {
    const arr = JSON.parse(txt)
    return Array.isArray(arr) ? (arr as CheckRun[]) : []
  } catch {
    return []
  }
}
