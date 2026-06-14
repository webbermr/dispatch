import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { log } from './log.js'

interface Preview {
  proc: ChildProcess
  url: string | null
  logs: string[]
  worktreePath: string
  command: string
}

let current: Preview | null = null

export interface PreviewStatus {
  running: boolean
  url?: string | null
  command?: string
  logs?: string[]
}

export function previewStatus(): PreviewStatus {
  if (!current) return { running: false }
  return { running: true, url: current.url, command: current.command, logs: current.logs.slice(-60) }
}

export function stopPreview(): void {
  if (current) {
    try {
      // Negative pid kills the whole process group (the dev server + children).
      process.kill(-current.proc.pid!, 'SIGTERM')
    } catch {
      try {
        current.proc.kill('SIGTERM')
      } catch {
        /* already gone */
      }
    }
    current = null
  }
}

/** Pick a dev-server command from the repo's package.json scripts, if any. */
export function detectPreviewCommand(worktreePath: string): string | null {
  const pkgPath = join(worktreePath, 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    const scripts = (JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}) as Record<string, string>
    for (const name of ['dev', 'start', 'preview', 'serve']) {
      if (scripts[name]) return `npm run ${name}`
    }
  } catch {
    /* unreadable package.json */
  }
  return null
}

/**
 * Start a dev server in `worktreePath` and resolve once it prints a localhost
 * URL (or after a timeout). Borrows node_modules from `installFrom` if the
 * worktree doesn't have its own. Only one preview runs at a time.
 */
export function startPreview(worktreePath: string, command: string, installFrom?: string): Promise<{ url: string | null; logs: string[] }> {
  stopPreview()

  // Worktrees are clean checkouts with no node_modules — borrow the repo's.
  const wtModules = join(worktreePath, 'node_modules')
  if (!existsSync(wtModules) && installFrom && existsSync(join(installFrom, 'node_modules'))) {
    try {
      symlinkSync(join(installFrom, 'node_modules'), wtModules, 'dir')
      log.info('preview: linked node_modules from', installFrom)
    } catch (err) {
      log.warn('preview: could not link node_modules', err)
    }
  }

  return new Promise((resolve) => {
    const proc = spawn('/bin/sh', ['-lc', command], {
      cwd: worktreePath,
      detached: true, // own process group, so stopPreview kills children too
      env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0', CI: '1' },
    })
    const p: Preview = { proc, url: null, logs: [], worktreePath, command }
    current = p
    log.info('preview: starting', command, 'in', worktreePath)

    let settled = false
    const settle = () => {
      if (!settled) {
        settled = true
        resolve({ url: p.url, logs: p.logs.slice(-60) })
      }
    }
    const onData = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (!line) continue
        p.logs.push(line)
        if (p.logs.length > 600) p.logs.shift()
      }
      if (!p.url) {
        const m = buf.toString().match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s'"]*/i)
        if (m) {
          p.url = m[0].replace('0.0.0.0', 'localhost')
          settle()
        }
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.on('error', (err) => {
      p.logs.push(`error: ${String(err)}`)
      settle()
    })
    proc.on('close', () => {
      if (current === p) current = null
      settle()
    })
    setTimeout(settle, 25000) // resolve even if no URL was detected
  })
}
