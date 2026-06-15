import { existsSync } from 'node:fs'
import { loadChats, loadConfig, saveChats } from './config.js'
import { getAgent } from './lib/agentRegistry.js'
import { bus } from './lib/events.js'
import { log } from './lib/log.js'
import type { ChatMessage, RepoChatRecord } from './types.js'

const MAX_MESSAGES = 60 // cap the persisted transcript so chats.json stays small

/**
 * Per-repo Q&A chat. Each turn runs the repo's agent READ-ONLY in the repo root
 * (so it can read files to answer but never edits), resuming the same session for
 * follow-ups. Answers stream to clients over the event bus.
 */
class RepoChatManager {
  private chats = new Map<string, RepoChatRecord>()
  private busy = new Set<string>()

  constructor() {
    for (const c of loadChats()) this.chats.set(c.appId, c)
  }

  private persist(): void {
    saveChats([...this.chats.values()])
  }

  private getOrCreate(appId: string): RepoChatRecord {
    let c = this.chats.get(appId)
    if (!c) {
      c = { appId, messages: [] }
      this.chats.set(appId, c)
    }
    return c
  }

  private trim(c: RepoChatRecord): void {
    if (c.messages.length > MAX_MESSAGES) c.messages = c.messages.slice(-MAX_MESSAGES)
  }

  transcript(appId: string): { messages: ChatMessage[]; thinking: boolean } {
    return { messages: this.chats.get(appId)?.messages ?? [], thinking: this.busy.has(appId) }
  }

  clear(appId: string): void {
    this.chats.delete(appId)
    this.busy.delete(appId)
    this.persist()
    bus.publish({ type: 'chat.status', appId, thinking: false })
  }

  /** Ask a question; the answer arrives asynchronously over the event bus. */
  ask(appId: string, text: string): void {
    const app = loadConfig().apps.find((a) => a.id === appId)
    if (!app) throw new Error('unknown app')
    if (!existsSync(app.localPath)) throw new Error('clone the repo before asking about it')
    if (this.busy.has(appId)) throw new Error('still answering your previous question — one at a time')

    const chat = this.getOrCreate(appId)
    const userMsg: ChatMessage = { role: 'user', text, ts: Date.now() }
    chat.messages.push(userMsg)
    this.trim(chat)
    this.persist()
    bus.publish({ type: 'chat.message', appId, message: userMsg })

    this.busy.add(appId)
    bus.publish({ type: 'chat.status', appId, thinking: true })

    const agentId = app.agent ?? 'codex'
    const firstTurn = !chat.sessionId
    const prompt = firstTurn
      ? `You are a helpful coding assistant answering questions about THIS repository. Read files as needed to answer accurately. Be concise and use Markdown. When asked how to build or change something, give concrete, repo-specific guidance (name real files and patterns). Do not modify any files.\n\nQuestion: ${text}`
      : text

    let last: string | undefined
    getAgent(agentId).run(
      { worktreePath: app.localPath, prompt, sessionId: chat.sessionId, mode: 'plan' },
      {
        onLog: (line) => {
          const t = line.trim()
          if (t) bus.publish({ type: 'chat.status', appId, thinking: true, note: t.slice(0, 120) })
        },
        onStep: () => {},
        onProgress: () => {},
        onSession: (sid) => {
          chat.sessionId = sid
        },
        onMessage: (t) => {
          last = t
        },
        onExit: (code) => {
          const answer = (last ?? '').trim() || (code === 0 ? '(No answer was returned.)' : 'Sorry — I ran into an error answering that. Try again?')
          const msg: ChatMessage = { role: 'agent', text: answer, ts: Date.now() }
          chat.messages.push(msg)
          this.trim(chat)
          this.busy.delete(appId)
          this.persist()
          bus.publish({ type: 'chat.message', appId, message: msg })
          bus.publish({ type: 'chat.status', appId, thinking: false })
          log.info(`repo chat answered for ${app.name} (exit ${code})`)
        },
      },
    )
  }
}

export const repoChat = new RepoChatManager()
