#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { ensureHome, HOST, PORT } from './config.js'
import { probeCodex } from './lib/codex.js'
import { log } from './lib/log.js'
import { registerRepo } from './lib/registry.js'
import { generatePairingCode, PairingManager } from './pairing.js'
import { buildServer, listen } from './server.js'

function parseArgs(argv: string[]): { pairCode?: string; open: boolean } {
  let pairCode: string | undefined
  let open = true
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pair') pairCode = argv[++i]
    else if (argv[i] === '--no-open') open = false
  }
  return { pairCode, open }
}

/** `dispatch-agent add <path> [name]` — register a local repo (no pairing needed). */
async function addRepo(pathArg: string | undefined, nameArg: string | undefined): Promise<void> {
  if (!pathArg) {
    console.error('usage: dispatch-agent add <path-to-git-repo> [name]')
    process.exit(1)
  }
  ensureHome()
  try {
    const app = await registerRepo({ localPath: pathArg, name: nameArg })
    console.log(`registered "${app.name}" → ${app.localPath}  (slug: ${app.repoSlug || 'none'}, branch: ${app.defaultBranch})`)
  } catch (err) {
    console.error((err as Error).message)
    process.exit(1)
  }
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref()
  } catch {
    /* best effort */
  }
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv[0] === 'add') {
    await addRepo(argv[1], argv[2])
    return
  }
  // Runner mode: connect outbound to a control-plane server and build its jobs locally.
  if (argv[0] === 'runner') {
    const serverUrl = flag(argv, '--server') || process.env.DISPATCH_SERVER_URL
    const token = flag(argv, '--token') || process.env.DISPATCH_RUNNER_TOKEN
    if (!serverUrl || !token) {
      console.error('usage: dispatch-agent runner --server <url> --token <runner-token>')
      process.exit(1)
    }
    ensureHome()
    const { startRunner } = await import('./runner/index.js')
    console.log(`\n  Dispatch runner → ${serverUrl}\n`)
    startRunner(serverUrl, token)
    return
  }
  const { pairCode, open } = parseArgs(argv)
  ensureHome()

  const code = pairCode?.toUpperCase() || generatePairingCode()
  const pairing = new PairingManager(code)

  const server = buildServer(pairing)
  await listen(server)

  const url = `http://${HOST}:${PORT}`
  const codex = await probeCodex()

  console.log('')
  console.log('  ┌─────────────────────────────────────────────┐')
  console.log('  │  Dispatch agent is running                    │')
  console.log('  └─────────────────────────────────────────────┘')
  console.log('')
  console.log(`  Web UI:   ${url}`)
  console.log(`  Pair code: ${code}`)
  console.log(`  Codex:    ${codex.installed ? `found (${codex.version})` : 'NOT installed — `npm i -g @openai/codex` or see docs'}`)
  console.log('')
  console.log(`  In the board's Connect modal, run:`)
  console.log(`    npx @dispatch/agent --pair ${code}`)
  console.log('')

  // Open same-origin with the pair code so the served bundle can auto-pair.
  if (open) openBrowser(`${url}/?pair=${code}`)

  const shutdown = () => {
    log.info('shutting down')
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1500).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  log.error('failed to start:', err)
  process.exit(1)
})
