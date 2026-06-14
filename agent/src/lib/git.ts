import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

/** Run a command, capturing output. Never runs a shell — args are passed verbatim. */
export function run(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, shell: false, env: opts.env ? { ...process.env, ...opts.env } : process.env })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          try {
            child.kill('SIGKILL')
          } catch {
            /* already gone */
          }
        }, opts.timeoutMs)
      : undefined
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + String(err) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr: timedOut ? stderr + '\n(timed out)' : stderr })
    })
  })
}

const git = (args: string[], cwd?: string) => run('git', args, { cwd })

/** True if `path` exists and is inside a git work tree. */
export async function isGitRepo(path: string): Promise<boolean> {
  if (!existsSync(path)) return false
  const r = await git(['rev-parse', '--is-inside-work-tree'], path)
  return r.code === 0 && r.stdout.trim() === 'true'
}

export async function currentBranch(path: string): Promise<string | null> {
  const r = await git(['rev-parse', '--abbrev-ref', 'HEAD'], path)
  return r.code === 0 ? r.stdout.trim() : null
}

/** Working tree is clean iff `git status --porcelain` is empty. */
export async function isClean(path: string): Promise<boolean> {
  const r = await git(['status', '--porcelain'], path)
  return r.code === 0 && r.stdout.trim() === ''
}

/** Ahead/behind counts vs the upstream tracking branch (0/0 if none). */
export async function aheadBehind(path: string): Promise<{ ahead: number; behind: number }> {
  const r = await git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], path)
  if (r.code !== 0) return { ahead: 0, behind: 0 }
  const [behind, ahead] = r.stdout.trim().split(/\s+/).map((n) => Number(n) || 0)
  return { ahead: ahead || 0, behind: behind || 0 }
}

/**
 * Clone `git@github.com:<slug>.git` into `dest`, streaming progress lines.
 * Resolves with the final exit code.
 */
export function clone(slug: string, dest: string, onLine: (line: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const url = `git@github.com:${slug}.git`
    onLine(`$ git clone ${url} ${dest}`)
    const child = spawn('git', ['clone', '--progress', url, dest], { shell: false })
    const forward = (buf: Buffer) =>
      buf
        .toString()
        .split(/\r?\n|\r/)
        .filter((l) => l.trim())
        .forEach(onLine)
    child.stdout.on('data', forward)
    child.stderr.on('data', forward) // git writes progress to stderr
    child.on('error', (err) => {
      onLine(`error: ${String(err)}`)
      resolve(-1)
    })
    child.on('close', (code) => {
      onLine(code === 0 ? '✓ clone complete' : `clone exited with code ${code}`)
      resolve(code ?? -1)
    })
  })
}

/**
 * Clone any git URL (https/ssh, GitHub/GitLab/other) into `dest`, streaming
 * progress. Never prompts for credentials (so it fails fast instead of hanging).
 */
export function cloneUrl(url: string, dest: string, onLine: (line: string) => void, timeoutMs = 180000): Promise<number> {
  return new Promise((resolve) => {
    onLine(`$ git clone ${url} ${dest}`)
    const child = spawn('git', ['clone', '--progress', url, dest], {
      shell: false,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new -oConnectTimeout=12' },
    })
    const timer = setTimeout(() => {
      onLine('clone timed out')
      child.kill('SIGTERM')
    }, timeoutMs)
    const forward = (buf: Buffer) =>
      buf
        .toString()
        .split(/\r?\n|\r/)
        .filter((l) => l.trim())
        .forEach(onLine)
    child.stdout.on('data', forward)
    child.stderr.on('data', forward)
    child.on('error', (err) => {
      clearTimeout(timer)
      onLine(`error: ${String(err)}`)
      resolve(-1)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      onLine(code === 0 ? '✓ clone complete' : `clone exited with code ${code}`)
      resolve(code ?? -1)
    })
  })
}

/** Normalize a user-entered repo into a clone URL + the folder name it implies. */
export function parseCloneTarget(input: string): { url: string; name: string } {
  let url = input.trim().replace(/\/+$/, '')
  // `owner/name` shorthand → GitHub https.
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`
  const name = (url.replace(/\.git$/, '').match(/([^/:]+)$/)?.[1] || 'repo').trim()
  return { url, name }
}

export async function hasCommits(path: string): Promise<boolean> {
  return (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], path)).code === 0
}

/** URL of the `origin` remote, or null if none is configured. */
export async function getRemoteUrl(path: string): Promise<string | null> {
  const r = await git(['remote', 'get-url', 'origin'], path)
  return r.code === 0 && r.stdout.trim() ? r.stdout.trim() : null
}

/**
 * Actually contact the `origin` remote (read refs) to confirm reachability +
 * credentials, without prompting or modifying anything. Non-interactive + timed.
 */
export async function lsRemote(path: string): Promise<{ ok: boolean; error?: string }> {
  const r = await run('git', ['ls-remote', '--heads', 'origin'], {
    cwd: path,
    timeoutMs: 12000,
    env: {
      GIT_TERMINAL_PROMPT: '0', // never block on a username/password prompt
      GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new -oConnectTimeout=8',
    },
  })
  if (r.code === 0) return { ok: true }
  const msg = (r.stderr || r.stdout).trim().split('\n').filter(Boolean).slice(-2).join(' ')
  return { ok: false, error: msg || `git ls-remote exited ${r.code}` }
}

/** The repo's default/current branch name — robust for unborn branches (no commits). */
export async function defaultBranchOf(path: string): Promise<string> {
  const sym = await git(['symbolic-ref', '--short', 'HEAD'], path)
  if (sym.code === 0 && sym.stdout.trim()) return sym.stdout.trim()
  const cur = await currentBranch(path)
  return cur && cur !== 'HEAD' ? cur : 'main'
}

export async function branchExists(path: string, branch: string): Promise<boolean> {
  const r = await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], path)
  return r.code === 0
}

/** Local branch names, excluding Dispatch's own `feat/…|fix/…|enh/…` build branches. */
export async function listBranches(path: string): Promise<string[]> {
  const r = await git(['branch', '--format=%(refname:short)'], path)
  if (r.code !== 0) return []
  return r.stdout
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b && !/^(feat|fix|enh)\//.test(b))
}

/**
 * Resolve a valid commit-ish to branch a worktree from. Prefers `preferred`,
 * falls back to the repo's current branch, and for an unborn repo (no commits)
 * creates an initial empty commit so there is something to branch from.
 */
export async function resolveBaseBranch(path: string, preferred?: string): Promise<string> {
  if (preferred) {
    const ok = await git(['rev-parse', '--verify', '--quiet', `${preferred}^{commit}`], path)
    if (ok.code === 0) return preferred
  }
  const hasHead = (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], path)).code === 0
  if (hasHead) {
    const cur = await currentBranch(path)
    return cur && cur !== 'HEAD' ? cur : 'HEAD'
  }
  // Unborn repo: create an initial commit on the current symbolic branch.
  const branch = await defaultBranchOf(path)
  const commit = await git(
    ['-c', 'user.name=Dispatch', '-c', 'user.email=dispatch@localhost', 'commit', '--allow-empty', '-m', 'Initial commit'],
    path,
  )
  if (commit.code !== 0) {
    throw new Error(`repo has no commits and an initial commit could not be created: ${commit.stderr.trim()}`)
  }
  return branch
}

/** Create an isolated worktree on a new branch off `baseBranch`. */
export async function addWorktree(repoPath: string, worktreePath: string, branch: string, baseBranch: string): Promise<ExecResult> {
  return git(['worktree', 'add', worktreePath, '-b', branch, baseBranch], repoPath)
}

export async function removeWorktree(repoPath: string, worktreePath: string): Promise<ExecResult> {
  return git(['worktree', 'remove', '--force', worktreePath], repoPath)
}

/**
 * Stage everything, then diff the index against `baseBranch` — captures the full
 * change set whether or not Codex committed (committed → base..HEAD; uncommitted
 * → base..working). Falls back to a plain cached diff if base can't be resolved.
 */
export async function captureDiff(worktreePath: string, baseBranch?: string): Promise<string> {
  await git(['add', '-A'], worktreePath)
  if (baseBranch) {
    const r = await git(['diff', '--cached', baseBranch], worktreePath)
    if (r.code === 0) return r.stdout
  }
  const r = await git(['diff', '--cached'], worktreePath)
  return r.stdout
}

export async function commitAll(worktreePath: string, message: string): Promise<ExecResult> {
  await git(['add', '-A'], worktreePath)
  return git(['commit', '-m', message], worktreePath)
}

export async function hasStagedOrUnstagedChanges(worktreePath: string): Promise<boolean> {
  return !(await isClean(worktreePath))
}
