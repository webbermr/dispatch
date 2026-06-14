import { getRemoteUrl } from './git.js'
import { ghAuthed, ghCreatePr, ghInstalled } from './gh.js'
import { glabAuthed, glabCreateMr, glabInstalled } from './glab.js'

export type Forge = 'github' | 'gitlab' | 'other'

export function forgeOfUrl(url: string | null): Forge {
  if (!url) return 'other'
  if (/github\./i.test(url)) return 'github'
  if (/gitlab\./i.test(url)) return 'gitlab'
  return 'other'
}

export async function forgeOfRepo(localPath: string): Promise<Forge> {
  return forgeOfUrl(await getRemoteUrl(localPath))
}

/** The CLI a forge uses, for messages. */
export function forgeCli(forge: Forge): string {
  return forge === 'gitlab' ? 'glab' : 'gh'
}

export function forgeLabel(forge: Forge): string {
  return forge === 'github' ? 'GitHub' : forge === 'gitlab' ? 'GitLab' : 'the remote'
}

/** Is the forge's CLI installed + authenticated? */
export async function forgeReady(forge: Forge): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (forge === 'github') {
    if (!(await ghInstalled())) return { ok: false, reason: 'GitHub CLI (gh) not found — install gh and run `gh auth login`' }
    if (!(await ghAuthed())) return { ok: false, reason: 'GitHub CLI isn’t signed in — run `gh auth login` in a terminal' }
    return { ok: true }
  }
  if (forge === 'gitlab') {
    if (!(await glabInstalled())) return { ok: false, reason: 'GitLab CLI (glab) not found — install glab and run `glab auth login`' }
    if (!(await glabAuthed())) return { ok: false, reason: 'GitLab CLI isn’t signed in — run `glab auth login` in a terminal' }
    return { ok: true }
  }
  return { ok: false, reason: 'this remote isn’t GitHub or GitLab — switch the repo to "Merge locally"' }
}

/** Open a PR (GitHub) or MR (GitLab) for head → base, returning its URL. */
export async function createPullRequest(
  forge: Forge,
  cwd: string,
  head: string,
  base: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (forge === 'github') return ghCreatePr(cwd, head, base)
  if (forge === 'gitlab') return glabCreateMr(cwd, head, base)
  return { ok: false, error: 'unsupported remote (not GitHub or GitLab)' }
}
