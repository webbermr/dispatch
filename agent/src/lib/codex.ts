import { type ChildProcess, spawn } from 'node:child_process'
import { run } from './git.js'
import { log } from './log.js'
import type { StepId } from '../types.js'

const CODEX_BIN = process.env.DISPATCH_CODEX_BIN || 'codex'

/** Probe `codex --version`. Drives the header chip's `codexInstalled` flag. */
export async function probeCodex(): Promise<{ installed: boolean; version: string | null }> {
  const r = await run(CODEX_BIN, ['--version'])
  if (r.code !== 0) return { installed: false, version: null }
  // e.g. "codex-cli 0.139.0" → "0.139.0"
  const m = r.stdout.trim().match(/(\d+\.\d+\.\d+\S*)/)
  return { installed: true, version: m ? m[1] : r.stdout.trim() }
}

export interface CodexHandlers {
  onLog: (line: string, stream: 'stdout' | 'stderr') => void
  onStep: (step: StepId, state: 'active' | 'done') => void
  onProgress: (pct: number) => void
  onSession?: (sessionId: string) => void
  /** Each assistant message; the manager keeps the last one for the review chat. */
  onMessage?: (text: string) => void
  onExit: (code: number) => void
}

export interface CodexController {
  kill: () => void
}

/** Progress checkpoints per step transition (advisory — see spec §6). */
const STEP_PCT: Record<StepId, number> = { cloning: 10, planning: 30, editing: 65, testing: 90, pr: 100 }

/** Heuristic step mapping for a raw log line (fallback when an item type is generic). */
function deriveStep(line: string): StepId | null {
  const l = line.toLowerCase()
  if (/\b(test|spec|jest|vitest|pytest|pass|fail)\b/.test(l)) return 'testing'
  if (/\b(commit|pull request|\bpr\b|push)\b/.test(l)) return 'pr'
  return null
}

// ---- Real codex 0.139 `--json` (JSONL) event shapes ----
interface CodexItem {
  id?: string
  type?: string // 'agent_message' | 'reasoning' | 'file_change' | 'command_execution' | ...
  text?: string
  command?: string
  changes?: { path: string; kind: string }[]
  status?: string
}
interface CodexEvent {
  type?: string // 'thread.started' | 'turn.started' | 'item.started' | 'item.completed' | 'turn.completed' | 'error'
  thread_id?: string
  item?: CodexItem
  message?: string
}

/**
 * Spawn `codex exec` inside `worktreePath` and stream its `--json` events through
 * the handlers. Flags verified against codex-cli 0.139 (spec §6/§11):
 *   codex exec --cd <wt> --json --sandbox workspace-write "<prompt>"
 * Follow-ups resume the session: `codex exec resume <sessionId> "<prompt>"`.
 */
export function runCodex(opts: { worktreePath: string; prompt: string; sessionId?: string }, h: CodexHandlers): CodexController {
  const sandbox = (process.env.DISPATCH_CODEX_FLAGS || '--sandbox workspace-write').split(/\s+/).filter(Boolean)
  // exec-level flags (--cd/--json/--sandbox) must precede the `resume` subcommand.
  const base = ['exec', '--cd', opts.worktreePath, '--json', ...sandbox]
  const args = opts.sessionId ? [...base, 'resume', opts.sessionId, opts.prompt] : [...base, opts.prompt]

  log.info('spawning:', CODEX_BIN, args.slice(0, -1).join(' '), '<prompt>')
  let child: ChildProcess
  try {
    // stdin must be /dev/null — codex otherwise blocks "Reading additional input from stdin…".
    child = spawn(CODEX_BIN, args, { cwd: opts.worktreePath, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    h.onLog(`failed to spawn codex: ${String(err)}`, 'stderr')
    h.onExit(-1)
    return { kill: () => {} }
  }

  const reachedStep: Record<StepId, boolean> = { cloning: false, planning: false, editing: false, testing: false, pr: false }
  const advance = (step: StepId) => {
    if (reachedStep[step]) return
    reachedStep[step] = true
    h.onStep(step, 'active')
    h.onProgress(STEP_PCT[step])
  }
  advance('cloning')

  const onEvent = (ev: CodexEvent) => {
    switch (ev.type) {
      case 'thread.started':
        if (ev.thread_id) h.onSession?.(ev.thread_id)
        advance('planning')
        return
      case 'turn.started':
        advance('planning')
        return
      case 'item.started':
      case 'item.completed': {
        const item = ev.item
        if (!item) return
        if (item.type === 'agent_message' && item.text) {
          h.onLog(item.text, 'stdout')
          if (ev.type === 'item.completed') h.onMessage?.(item.text)
        } else if (item.type === 'file_change' && item.changes) {
          advance('editing')
          for (const c of item.changes) h.onLog(`✎ ${c.kind} ${c.path}`, 'stdout')
        } else if (item.type === 'command_execution') {
          const cmd = item.command ?? ''
          advance(deriveStep(cmd) === 'testing' ? 'testing' : 'editing')
          if (cmd) h.onLog(`$ ${cmd}`, 'stdout')
        } else if (item.type === 'reasoning' && item.text && ev.type === 'item.completed') {
          h.onLog(item.text, 'stdout')
        }
        return
      }
      case 'turn.completed':
        advance('pr')
        return
      case 'error':
        if (ev.message) h.onLog(`error: ${ev.message}`, 'stderr')
        return
    }
  }

  const handle = (raw: Buffer, stream: 'stdout' | 'stderr') => {
    for (const line of raw.toString().split(/\r?\n/)) {
      if (!line.trim()) continue
      if (line.startsWith('{')) {
        try {
          onEvent(JSON.parse(line) as CodexEvent)
          continue
        } catch {
          /* not JSON — fall through */
        }
      }
      // Plain (non-JSON) line: forward verbatim and derive a step heuristically.
      h.onLog(line, stream)
      const step = deriveStep(line)
      if (step) advance(step)
    }
  }

  child.stdout?.on('data', (d) => handle(d, 'stdout'))
  child.stderr?.on('data', (d) => handle(d, 'stderr'))
  child.on('error', (err) => {
    h.onLog(`codex error: ${String(err)}`, 'stderr')
    h.onExit(-1)
  })
  child.on('close', (code) => h.onExit(code ?? -1))

  return { kill: () => child.kill('SIGTERM') }
}
