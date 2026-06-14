import { run } from './git.js'

const GLAB = process.env.DISPATCH_GLAB_BIN || 'glab'

export async function glabInstalled(): Promise<boolean> {
  return (await run(GLAB, ['--version'])).code === 0
}

export async function glabAuthed(): Promise<boolean> {
  return (await run(GLAB, ['auth', 'status'], { env: { GITLAB_HOST: process.env.GITLAB_HOST || '' } })).code === 0
}

/**
 * Open a GitLab merge request for `head` → `base` from within `cwd`, returning
 * its URL. If an MR already exists, returns that one. Never prompts.
 */
export async function glabCreateMr(
  cwd: string,
  head: string,
  base: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const r = await run(
    GLAB,
    ['mr', 'create', '--source-branch', head, '--target-branch', base, '--fill', '--yes'],
    { cwd, timeoutMs: 30000 },
  )
  const out = `${r.stdout}\n${r.stderr}`
  const url = out.match(/https?:\/\/\S+\/-\/merge_requests\/\d+/)?.[0] ?? out.match(/https?:\/\/\S+/)?.[0]
  if (r.code === 0 && url) return { ok: true, url }
  // glab prints the existing MR URL when one already exists.
  if (/already exists|open merge request/i.test(out) && url) return { ok: true, url }
  const error = (r.stderr || r.stdout).trim().split('\n').filter(Boolean).slice(-2).join(' ')
  return { ok: false, error: error || `glab mr create exited ${r.code}` }
}
