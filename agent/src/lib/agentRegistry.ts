import { claudeAgent } from './claude.js'
import { codexAgent } from './codex.js'
import type { CodingAgent } from './agents.js'
import type { CodingAgentId } from '../types.js'

export const AGENTS: Record<CodingAgentId, CodingAgent> = { codex: codexAgent, claude: claudeAgent }
export const DEFAULT_AGENT: CodingAgentId = 'codex'

export function getAgent(id: CodingAgentId | undefined): CodingAgent {
  return (id && AGENTS[id]) || AGENTS[DEFAULT_AGENT]
}

export interface AgentInfo {
  id: CodingAgentId
  label: string
  installed: boolean
  version: string | null
  models: { id: string; label: string }[]
}

export async function probeAgents(): Promise<AgentInfo[]> {
  return Promise.all(Object.values(AGENTS).map(async (a) => ({ id: a.id, label: a.label, models: a.models, ...(await a.probe()) })))
}
