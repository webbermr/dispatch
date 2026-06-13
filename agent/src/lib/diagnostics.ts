import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getRemoteUrl, hasCommits, isGitRepo, lsRemote } from './git.js'

export interface RepoDiagnosis {
  /** ok = ready for the full loop; warn = usable with caveats; error = can't use it. */
  level: 'ok' | 'warn' | 'error'
  message: string
  /** Actionable instructions / shell commands for the user when not fully ready. */
  steps: string[]
  details: {
    exists: boolean
    isGitRepo: boolean
    hasCommits: boolean
    remoteUrl: string | null
    host: string | null
    remoteReachable: boolean | null // null = no remote to check
  }
}

function hostOf(url: string): string {
  if (/github\./i.test(url)) return 'GitHub'
  if (/gitlab\./i.test(url)) return 'GitLab'
  if (/bitbucket\./i.test(url)) return 'Bitbucket'
  return 'the remote'
}

/**
 * Inspect a local path and report whether Dispatch can build → commit → push
 * there, with concrete next steps when it can't. The remote check actually
 * connects (`git ls-remote`) to verify the clone + credentials.
 */
export async function diagnoseRepo(localPath: string): Promise<RepoDiagnosis> {
  const abs = resolve(localPath)
  const base = { exists: false, isGitRepo: false, hasCommits: false, remoteUrl: null as string | null, host: null as string | null, remoteReachable: null as boolean | null }

  if (!abs) {
    return { level: 'error', message: 'Enter the path to a local git repository.', steps: [], details: base }
  }
  if (!existsSync(abs)) {
    return {
      level: 'error',
      message: `Nothing exists at ${abs} on this machine.`,
      steps: ['Clone your repo to this path first, e.g.:', `git clone git@github.com:owner/repo.git "${abs}"`],
      details: base,
    }
  }
  base.exists = true

  if (!(await isGitRepo(abs))) {
    return {
      level: 'error',
      message: `${abs} exists but isn't a git repository.`,
      steps: [
        'If your project lives on GitHub/GitLab, clone it here:',
        `git clone <repo-url> "${abs}"`,
        'Or, to start fresh: git init',
      ],
      details: base,
    }
  }
  base.isGitRepo = true
  base.hasCommits = await hasCommits(abs)
  base.remoteUrl = await getRemoteUrl(abs)
  base.host = base.remoteUrl ? hostOf(base.remoteUrl) : null

  const commitNote = base.hasCommits ? '' : ' No commits yet — Dispatch will make an initial commit on the first build.'

  // No remote: local-only is fine for build + local merge, but can't push/PR.
  if (!base.remoteUrl) {
    return {
      level: 'warn',
      message: `Local git repo, no remote configured. Dispatch can build and merge locally, but can't push or open PRs.${commitNote}`,
      steps: ['To enable push / pull-requests, add a remote:', 'git remote add origin git@github.com:owner/repo.git'],
      details: base,
    }
  }

  // Remote configured: actually try to reach it.
  const ls = await lsRemote(abs)
  base.remoteReachable = ls.ok
  if (!ls.ok) {
    return {
      level: 'warn',
      message: `Found a ${base.host} remote but couldn't connect to it.${commitNote}`,
      steps: [
        'Check your network and credentials (SSH key or access token).',
        'Test the connection yourself:',
        'git ls-remote origin',
        ...(ls.error ? [`Git reported: ${ls.error}`] : []),
      ],
      details: base,
    }
  }

  return {
    level: 'ok',
    message: `Connected to ${base.host} — ready to build, commit, and push.${commitNote}`,
    steps: [],
    details: base,
  }
}
