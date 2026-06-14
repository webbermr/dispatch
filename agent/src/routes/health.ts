import { Router } from 'express'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadConfig } from '../config.js'
import { probeAgents } from '../lib/agentRegistry.js'
import { ghAuthed, ghInstalled } from '../lib/gh.js'
import { glabAuthed, glabInstalled } from '../lib/glab.js'
import type { HealthResponse } from '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function agentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'))
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function healthRouter(): Router {
  const r = Router()
  const version = agentVersion()
  r.get('/health', async (_req, res) => {
    const [agents, ghHas, glabHas] = await Promise.all([probeAgents(), ghInstalled(), glabInstalled()])
    const [ghOk, glabOk] = await Promise.all([ghHas ? ghAuthed() : Promise.resolve(false), glabHas ? glabAuthed() : Promise.resolve(false)])
    const codex = agents.find((a) => a.id === 'codex')
    const body: HealthResponse = {
      ok: true,
      version,
      codexVersion: codex?.version ?? null,
      codexInstalled: !!codex?.installed,
      ghInstalled: ghHas,
      ghAuthed: ghOk,
      glabInstalled: glabHas,
      glabAuthed: glabOk,
      concurrency: loadConfig().concurrency,
      agents,
    }
    res.json(body)
  })
  return r
}
