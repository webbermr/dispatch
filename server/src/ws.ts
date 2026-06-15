import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { repoAccess } from './auth/access.js'
import { userForToken } from './auth/session.js'
import { bus } from './bus.js'
import { id } from './ids.js'
import { ingestRunnerEvent, interruptRunnerRuns, runners } from './runners.js'
import { store } from './store/jsonStore.js'

/**
 * Two WebSocket channels on one HTTP server, routed by path via a single upgrade
 * handler (the supported way to run multiple WS servers on one port):
 *   /stream?token&repoId  — browsers: live board events for a repo
 *   /runner?token         — agents: build jobs out, run events in
 */
export function attachWebSocket(server: Server): void {
  const streamWss = new WebSocketServer({ noServer: true })
  const runnerWss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '', 'http://localhost').pathname
    if (pathname === '/stream') streamWss.handleUpgrade(req, socket, head, (ws) => streamWss.emit('connection', ws, req))
    else if (pathname === '/runner') runnerWss.handleUpgrade(req, socket, head, (ws) => runnerWss.emit('connection', ws, req))
    else socket.destroy()
  })

  // ---- Browser board sync ----
  streamWss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const user = userForToken(url.searchParams.get('token') ?? undefined)
    const repoId = url.searchParams.get('repoId') ?? ''
    if (!user) return void ws.close(4401, 'unauthorized')
    const access = repoAccess(user.id, repoId, 'viewer')
    if ('error' in access) return void ws.close(4403, access.error)
    const unsubscribe = bus.subscribe(repoId, (ev) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev))
    })
    ws.on('close', unsubscribe)
    ws.on('error', unsubscribe)
    ws.send(JSON.stringify({ type: 'ready', repoId }))
  })

  // ---- Runner channel ----
  runnerWss.on('connection', (ws: WebSocket, req) => {
    const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token') ?? ''
    const rt = store.runnerTokens.find((t) => t.token === token)
    if (!rt) return void ws.close(4401, 'invalid runner token')
    const connId = id('rconn')
    let registered = false

    ws.on('message', (data) => {
      let msg: { type?: string; repos?: string[]; name?: string; runId?: string; event?: unknown }
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (msg.type === 'register') {
        runners.add({ connId, workspaceId: rt.workspaceId, userId: rt.userId, name: msg.name || 'runner', repos: Array.isArray(msg.repos) ? msg.repos : [], send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)) })
        registered = true
        ws.send(JSON.stringify({ type: 'registered' }))
      } else if (msg.type === 'run.event' && msg.runId && msg.event) {
        ingestRunnerEvent(msg.runId, msg.event as Parameters<typeof ingestRunnerEvent>[1])
      }
    })

    const cleanup = () => {
      if (registered) {
        runners.remove(connId)
        interruptRunnerRuns(rt.workspaceId, rt.userId)
      }
    }
    ws.on('close', cleanup)
    ws.on('error', cleanup)
  })
}
