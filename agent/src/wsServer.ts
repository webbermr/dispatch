import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { bus } from './lib/events.js'
import { log } from './lib/log.js'
import { isOriginAllowed } from './lib/security.js'
import type { PairingManager } from './pairing.js'
import type { ServerEvent } from './types.js'

interface ClientState {
  /** runIds this client wants, or '*' for all. */
  subs: Set<string>
  all: boolean
}

/**
 * Attach the streaming WebSocket server at /stream (spec §4). Clients connect
 * with `?token=…`, then send `{ type:'subscribe', runId }` (or '*').
 */
export function attachWebSocket(server: Server, pairing: PairingManager): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/stream') return
    if (!isOriginAllowed(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }
    const url = new URL(req.url, 'http://127.0.0.1')
    const token = url.searchParams.get('token') ?? undefined
    if (!pairing.isValid(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
  })

  const clients = new Map<WebSocket, ClientState>()

  wss.on('connection', (ws) => {
    const state: ClientState = { subs: new Set(), all: false }
    clients.set(ws, state)
    log.info('ws client connected')
    ws.send(JSON.stringify({ type: 'agent.status', online: true } satisfies ServerEvent))

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'subscribe') {
          if (msg.runId === '*') state.all = true
          else if (typeof msg.runId === 'string') state.subs.add(msg.runId)
        } else if (msg.type === 'unsubscribe' && typeof msg.runId === 'string') {
          state.subs.delete(msg.runId)
        }
      } catch {
        /* ignore malformed frames */
      }
    })

    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))
  })

  // Fan out run events to interested clients.
  bus.onEvent((ev: ServerEvent) => {
    const runId = 'runId' in ev ? ev.runId : null
    const payload = JSON.stringify(ev)
    for (const [ws, state] of clients) {
      if (ws.readyState !== ws.OPEN) continue
      const wants = !runId || state.all || state.subs.has(runId)
      if (wants) ws.send(payload)
    }
  })
}
