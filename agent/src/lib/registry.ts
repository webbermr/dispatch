import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { loadConfig, saveConfig } from '../config.js'
import { defaultBranchOf, isGitRepo, run } from './git.js'
import type { AppRecord } from '../types.js'

export interface RegisterInput {
  localPath: string
  name?: string
  repoSlug?: string
  defaultBranch?: string
  /** Explicit Local/Remote classification; defaults to remote when an origin exists. */
  repoMode?: 'local' | 'remote'
}

/**
 * Register a local git repo as an app. Shared by the CLI `add` command and
 * `POST /apps` so both behave identically: validate it's a git repo, derive the
 * repoSlug (from `origin`) and default branch (from HEAD) when not given, and
 * approve the repo's parent directory as a root (path containment, spec §8.6).
 */
export async function registerRepo(input: RegisterInput): Promise<AppRecord> {
  const localPath = resolve(input.localPath)
  if (!existsSync(localPath)) throw new Error(`path does not exist: ${localPath}`)
  if (!(await isGitRepo(localPath))) throw new Error(`not a git repository: ${localPath}`)

  const cfg = loadConfig()
  if (cfg.apps.some((a) => resolve(a.localPath) === localPath)) {
    throw new Error('this repo is already registered')
  }

  let repoSlug = input.repoSlug
  if (!repoSlug) {
    const remote = await run('git', ['remote', 'get-url', 'origin'], { cwd: localPath })
    repoSlug = remote.code === 0 ? (remote.stdout.trim().match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1] ?? '') : ''
  }
  const defaultBranch = input.defaultBranch || (await defaultBranchOf(localPath))
  // Remote by default when a git host is present; the user can override either way.
  const repoMode: 'local' | 'remote' = input.repoMode ?? (repoSlug ? 'remote' : 'local')

  const app: AppRecord = {
    id: `a_${Date.now().toString(36)}`,
    name: input.name?.trim() || basename(localPath),
    localPath,
    repoSlug,
    defaultBranch,
    repoMode,
    // Remote repos open PRs by default; local-only repos merge in place.
    mergeStrategy: repoMode === 'remote' ? 'pr' : 'merge',
    buildLocation: 'worktree',
    agent: 'codex',
  }
  cfg.apps.push(app)
  // The user explicitly chose this path, so approve its parent as a root.
  const parent = resolve(localPath, '..')
  if (!cfg.roots.includes(parent)) cfg.roots.push(parent)
  saveConfig(cfg)
  return app
}
