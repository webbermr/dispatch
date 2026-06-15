// Copy the built web bundle into the agent package (agent/web), so a published or
// globally-installed agent serves the UI with no frontend build at install time.
// Run after `cd web && npm run build`.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const agentDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const webDist = join(agentDir, '..', 'web', 'dist')
const dest = join(agentDir, 'web')

if (!existsSync(join(webDist, 'index.html'))) {
  console.error('web/dist not found — build the web first:  cd web && npm install && npm run build')
  process.exit(1)
}
rmSync(dest, { recursive: true, force: true })
cpSync(webDist, dest, { recursive: true })
console.log(`bundled web → ${dest}`)
