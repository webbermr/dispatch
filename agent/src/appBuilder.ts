import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DISPATCH_HOME } from './config.js'
import { getAgent, probeAgents } from './lib/agentRegistry.js'
import { run as execGit } from './lib/git.js'
import { log } from './lib/log.js'
import type { BuilderPlan, ChatMessage, CardType, CodingAgentId } from './types.js'

const SCRATCH = join(DISPATCH_HOME, 'scratch')

const INTERVIEW_SYSTEM =
  `You are an expert product engineer interviewing someone to define a brand-new software project from scratch. ` +
  `Your goal is to uncover the REAL underlying goal of the project — what they actually need, not just what they first say.\n\n` +
  `Rules:\n` +
  `- Ask EXACTLY ONE question at a time. Keep each question short and concrete.\n` +
  `- Bias strongly toward a SMALL, compartmentalized first iteration — the minimum that delivers the core value, not a complete product.\n` +
  `- When the user reveals an important decision (scope, platform, data, a key feature, who the user is), briefly restate it back and ask them to confirm before moving on, so nothing is missed.\n` +
  `- Do NOT produce a spec, summary, or plan yet — just keep interviewing until the essentials for a small first version are clear.\n\n` +
  `Ask your first question now.`

interface BuilderSession {
  id: string
  agentId: CodingAgentId
  sessionId?: string
  messages: ChatMessage[]
}

/** Parse the JSON spec object the AI returns when asked for a plan. */
function parseBuilderPlan(text: string): BuilderPlan | null {
  const s = text.indexOf('{')
  const e = text.lastIndexOf('}')
  if (s < 0 || e < 0 || e < s) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(text.slice(s, e + 1))
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const types: CardType[] = ['feature', 'bug', 'enhancement']
  const rawCards = Array.isArray(obj.cards) ? (obj.cards as Record<string, unknown>[]) : []
  const cards = rawCards
    .filter((c) => c && typeof c.title === 'string' && (c.title as string).trim())
    .slice(0, 8)
    .map((c) => ({
      title: String(c.title).trim().slice(0, 80),
      type: types.includes(c.type as CardType) ? (c.type as CardType) : 'feature',
      prompt: typeof c.prompt === 'string' && (c.prompt as string).trim() ? String(c.prompt).trim() : String(c.title).trim(),
      scaffold: c.scaffold === true,
    }))
  if (!cards.length) return null
  // Exactly one scaffold: honor the AI's mark, else default to the first card.
  if (!cards.some((c) => c.scaffold)) cards[0].scaffold = true
  else {
    let seen = false
    for (const c of cards) {
      if (c.scaffold && seen) c.scaffold = false
      if (c.scaffold) seen = true
    }
  }
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 60) : 'New app'
  const slugSource = typeof obj.repoSlug === 'string' && obj.repoSlug.trim() ? obj.repoSlug : name
  const repoSlug = slugSource.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'new-app'
  return { name, summary: typeof obj.summary === 'string' ? obj.summary.trim() : '', repoSlug, cards }
}

/**
 * Drives an AI interview to define a new app, then produces a first-iteration
 * spec. The interview is a read-only agent session in a scratch directory (no
 * repo exists yet), resumed across turns so context carries.
 */
class AppBuilder {
  private sessions = new Map<string, BuilderSession>()
  private seq = 0

  private async pickAgent(): Promise<CodingAgentId> {
    const installed = (await probeAgents()).filter((a) => a.installed)
    return (installed.find((a) => a.id === 'codex') ?? installed[0])?.id ?? 'codex'
  }

  private get(id: string): BuilderSession {
    const s = this.sessions.get(id)
    if (!s) throw new Error('unknown builder session — start a new one')
    return s
  }

  /** The interview runs in a scratch git repo — codex only trusts git dirs. */
  private async ensureScratch(): Promise<void> {
    if (!existsSync(SCRATCH)) mkdirSync(SCRATCH, { recursive: true })
    if (!existsSync(join(SCRATCH, '.git'))) await execGit('git', ['init'], { cwd: SCRATCH })
  }

  private async run(s: BuilderSession, prompt: string): Promise<string> {
    await this.ensureScratch()
    return new Promise((resolve) => {
      let last: string | undefined
      getAgent(s.agentId).run(
        { worktreePath: SCRATCH, prompt, sessionId: s.sessionId, mode: 'plan' },
        {
          onLog: () => {},
          onStep: () => {},
          onProgress: () => {},
          onSession: (sid) => {
            s.sessionId = sid
          },
          onMessage: (t) => {
            last = t
          },
          onExit: () => resolve((last ?? '').trim()),
        },
      )
    })
  }

  async start(): Promise<{ id: string; message: string }> {
    const id = `b_${Date.now().toString(36)}_${(this.seq++).toString(36)}`
    const agentId = await this.pickAgent()
    const s: BuilderSession = { id, agentId, messages: [] }
    this.sessions.set(id, s)
    const q = (await this.run(s, INTERVIEW_SYSTEM)) || 'What would you like to build?'
    s.messages.push({ role: 'agent', text: q, ts: Date.now() })
    log.info(`app-builder session ${id} started (${agentId})`)
    return { id, message: q }
  }

  async message(id: string, text: string): Promise<{ message: string }> {
    const s = this.get(id)
    s.messages.push({ role: 'user', text, ts: Date.now() })
    const q = (await this.run(s, text)) || '(no response — try rephrasing)'
    s.messages.push({ role: 'agent', text: q, ts: Date.now() })
    return { message: q }
  }

  async plan(id: string): Promise<BuilderPlan> {
    const s = this.get(id)
    const instr =
      `We're done interviewing. Based on everything above, output ONLY a JSON object (no markdown fences, no prose) shaped:\n` +
      `{\n` +
      `  "name": short product name,\n` +
      `  "summary": one or two sentence summary of the FIRST iteration,\n` +
      `  "repoSlug": a kebab-case repository name,\n` +
      `  "cards": [ { "title": short imperative title, "type": "feature" | "bug" | "enhancement", "scaffold": boolean, "prompt": "<a user story 'As a <role>, I want <goal>, so that <benefit>.' then a blank line, then 'Acceptance Criteria:' then one or more 'Scenario:' blocks each with Given / When / Then lines>" } ]\n` +
      `}\n` +
      `Keep the first iteration SMALL: 3 to 6 independently-shippable cards, ordered by a sensible build sequence.\n` +
      `Mark EXACTLY ONE card with "scaffold": true — the foundation card that sets up the project skeleton (structure, entry point, build setup). It must build and merge before the others, which will then build on top of it. All other cards have "scaffold": false.`
    const text = await this.run(s, instr)
    const plan = parseBuilderPlan(text)
    if (!plan) throw new Error('could not turn the interview into a plan — answer a couple more questions, then try again')
    return plan
  }
}

export const appBuilder = new AppBuilder()
