import { type ChildProcess, spawn } from 'node:child_process'
import { run } from './git.js'
import { log } from './log.js'
import { type AgentController, type AgentHandlers, type AgentRunOpts, type CodingAgent, makeStepper } from './agents.js'
import type { StepId } from '../types.js'

const CLAUDE_BIN = process.env.DISPATCH_CLAUDE_BIN || 'claude'

async function probe(): Promise<{ installed: boolean; version: string | null }> {
  const r = await run(CLAUDE_BIN, ['--version'])
  if (r.code !== 0) return { installed: false, version: null }
  // e.g. "2.1.177 (Claude Code)" → "2.1.177"
  const m = r.stdout.trim().match(/(\d+\.\d+\.\d+\S*)/)
  return { installed: true, version: m ? m[1] : r.stdout.trim() }
}

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Update'])

function stepForTool(name: string, input: Record<string, unknown> | undefined): StepId | null {
  if (EDIT_TOOLS.has(name)) return 'editing'
  if (name === 'Bash') {
    const cmd = String((input as { command?: string })?.command ?? '').toLowerCase()
    if (/\b(test|spec|jest|vitest|pytest|npm test|yarn test|go test)\b/.test(cmd)) return 'testing'
    return 'editing'
  }
  return null
}

/**
 * Run Claude Code headlessly: `claude -p --output-format stream-json --verbose
 * --permission-mode acceptEdits "<prompt>"`. Resumes a session with `--resume`.
 * Maps its JSONL events onto Dispatch's step timeline + log + chat (verified
 * against Claude Code 2.x).
 */
function runClaude(opts: AgentRunOpts, h: AgentHandlers): AgentController {
  // Plan mode uses Claude Code's native plan permission (proposes, never edits).
  const mode = opts.mode === 'plan' ? '--permission-mode plan' : process.env.DISPATCH_CLAUDE_FLAGS || '--permission-mode acceptEdits'
  const base = ['-p', '--output-format', 'stream-json', '--verbose', ...mode.split(/\s+/).filter(Boolean)]
  if (opts.model?.trim()) base.push('--model', opts.model.trim())
  if (opts.sessionId) base.push('--resume', opts.sessionId)
  const args = [...base, opts.prompt]

  log.info('spawning:', CLAUDE_BIN, base.join(' '), '<prompt>')
  let child: ChildProcess
  try {
    child = spawn(CLAUDE_BIN, args, { cwd: opts.worktreePath, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    h.onLog(`failed to spawn claude: ${String(err)}`, 'stderr')
    h.onExit(-1)
    return { kill: () => {} }
  }

  const advance = makeStepper(h)
  advance('cloning')
  let lastText: string | undefined
  let buf = ''

  const onEvent = (ev: { type?: string; subtype?: string; session_id?: string; message?: { content?: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[] }; result?: string; is_error?: boolean }) => {
    if (ev.session_id) h.onSession?.(ev.session_id)
    switch (ev.type) {
      case 'system':
        if (ev.subtype === 'init') advance('planning')
        return
      case 'assistant': {
        for (const b of ev.message?.content ?? []) {
          if (b.type === 'text' && b.text?.trim()) {
            lastText = b.text
            h.onLog(b.text.trim(), 'stdout')
          } else if (b.type === 'tool_use' && b.name) {
            const step = stepForTool(b.name, b.input)
            if (step) advance(step)
            const file = (b.input as { file_path?: string; path?: string } | undefined)?.file_path ?? (b.input as { path?: string } | undefined)?.path
            const cmd = (b.input as { command?: string } | undefined)?.command
            h.onLog(file ? `✎ ${b.name} ${file}` : cmd ? `$ ${cmd}` : `• ${b.name}`, 'stdout')
          }
        }
        return
      }
      case 'result':
        advance('pr')
        if (ev.result?.trim()) {
          lastText = ev.result
          h.onMessage?.(ev.result.trim())
        } else if (lastText) {
          h.onMessage?.(lastText.trim())
        }
        if (ev.is_error) h.onLog('claude reported an error', 'stderr')
        return
    }
  }

  const handle = (raw: Buffer) => {
    buf += raw.toString()
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line))
      } catch {
        h.onLog(line, 'stdout')
      }
    }
  }

  child.stdout?.on('data', handle)
  child.stderr?.on('data', (d) => h.onLog(d.toString().trimEnd(), 'stderr'))
  child.on('error', (err) => {
    h.onLog(`claude error: ${String(err)}`, 'stderr')
    h.onExit(-1)
  })
  child.on('close', (code) => h.onExit(code ?? -1))

  return { kill: () => child.kill('SIGTERM') }
}

export const claudeAgent: CodingAgent = {
  id: 'claude',
  label: 'Claude Code',
  models: [
    { id: '', label: 'Default' },
    { id: 'opus', label: 'Opus — most capable' },
    { id: 'sonnet', label: 'Sonnet — balanced' },
    { id: 'haiku', label: 'Haiku — fastest' },
  ],
  probe,
  run: runClaude,
}
