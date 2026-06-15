import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { repoAccess } from './auth/access.js'
import { userForToken } from './auth/session.js'
import { bus } from './bus.js'

/**
 * Live board sync. Clients connect to:
 *   /stream?token=<session>&repoId=<repo>
 * and receive every BoardEvent for that repo. Auth + repo membership are checked
 * at connect; the socket is closed if either fails.
 */
export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/stream' })

  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const token = url.searchParams.get('token') ?? undefined
    const repoId = url.searchParams.get('repoId') ?? ''
    const user = userForToken(token)
    if (!user) {
      ws.close(4401, 'unauthorized')
      return
    }
    const access = repoAccess(user.id, repoId, 'viewer')
    if ('error' in access) {
      ws.close(4403, access.error)
      return
    }

    const unsubscribe = bus.subscribe(repoId, (ev) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev))
    })
    ws.on('close', unsubscribe)
    ws.on('error', unsubscribe)
    ws.send(JSON.stringify({ type: 'ready', repoId }))
  })
}
