import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { log } from './lib/log.js'
import type { PersistedConfig, PersistedState, RepoChatRecord } from './types.js'

export const DISPATCH_HOME = process.env.DISPATCH_HOME || join(homedir(), '.dispatch')
export const CONFIG_PATH = join(DISPATCH_HOME, 'config.json')
export const STATE_PATH = join(DISPATCH_HOME, 'state.json')
export const PAIRINGS_PATH = join(DISPATCH_HOME, 'pairings.json')
export const CHATS_PATH = join(DISPATCH_HOME, 'chats.json')
export const WORKTREES_DIR = join(DISPATCH_HOME, 'worktrees')

export const PORT = Number(process.env.DISPATCH_PORT || 4317)
export const HOST = '127.0.0.1'

const DEFAULT_CONFIG: PersistedConfig = {
  apps: [],
  roots: [join(homedir(), 'code'), join(homedir(), 'Projects'), join(homedir(), 'src')],
  mergeStrategy: 'pr',
  concurrency: 3,
}

const DEFAULT_STATE: PersistedState = { runs: [], cards: [] }

export function ensureHome(): void {
  if (!existsSync(DISPATCH_HOME)) {
    mkdirSync(DISPATCH_HOME, { recursive: true })
    log.info('created', DISPATCH_HOME)
  }
  if (!existsSync(WORKTREES_DIR)) mkdirSync(WORKTREES_DIR, { recursive: true })
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return { ...fallback, ...(JSON.parse(readFileSync(path, 'utf8')) as object) } as T
  } catch (err) {
    log.warn(`could not read ${path} — using defaults`, err)
    return fallback
  }
}

/** Atomic write: write a temp file then rename, so a crash can't truncate state. */
function writeJson(path: string, data: unknown): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, path)
}

export function loadConfig(): PersistedConfig {
  return readJson<PersistedConfig>(CONFIG_PATH, structuredClone(DEFAULT_CONFIG))
}

export function saveConfig(cfg: PersistedConfig): void {
  writeJson(CONFIG_PATH, cfg)
}

export function loadState(): PersistedState {
  return readJson<PersistedState>(STATE_PATH, structuredClone(DEFAULT_STATE))
}

export function saveState(state: PersistedState): void {
  writeJson(STATE_PATH, state)
}

export function loadChats(): RepoChatRecord[] {
  return readJson<{ chats: RepoChatRecord[] }>(CHATS_PATH, { chats: [] }).chats
}

export function saveChats(chats: RepoChatRecord[]): void {
  writeJson(CHATS_PATH, { chats })
}

export function loadPairings(): string[] {
  return readJson<{ tokens: string[] }>(PAIRINGS_PATH, { tokens: [] }).tokens
}

export function savePairings(tokens: string[]): void {
  writeJson(PAIRINGS_PATH, { tokens })
}
