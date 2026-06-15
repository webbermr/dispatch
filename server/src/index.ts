import { createServer } from 'node:http'
import { buildApp } from './app.js'
import { ALLOW_DEV_LOGIN, HOST, PORT } from './config.js'
import { githubConfigured } from './auth/oauth.js'
import { attachWebSocket } from './ws.js'

const server = createServer(buildApp())
attachWebSocket(server)

server.listen(PORT, HOST, () => {
  console.log('')
  console.log('  ┌─────────────────────────────────────────────┐')
  console.log('  │  Dispatch control-plane server                │')
  console.log('  └─────────────────────────────────────────────┘')
  console.log('')
  console.log(`  Listening:  http://${HOST}:${PORT}`)
  console.log(`  Dev login:  ${ALLOW_DEV_LOGIN ? 'enabled' : 'disabled'}`)
  console.log(`  GitHub OAuth: ${githubConfigured() ? 'configured' : 'not configured'}`)
  console.log('')
})
