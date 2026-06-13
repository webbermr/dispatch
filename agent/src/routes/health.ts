import { Router } from 'express'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { probeCodex } from '../lib/codex.js'
import { ghAuthed, ghInstalled } from '../lib/gh.js'
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
    const [codex, ghHas] = await Promise.all([probeCodex(), ghInstalled()])
    const body: HealthResponse = {
      ok: true,
      version,
      codexVersion: codex.version,
      codexInstalled: codex.installed,
      ghInstalled: ghHas,
      ghAuthed: ghHas ? await ghAuthed() : false,
    }
    res.json(body)
  })
  return r
}
