import type { CodingAgentId, StepId } from '../types.js'

export type { CodingAgentId }

export interface AgentHandlers {
  onLog: (line: string, stream: 'stdout' | 'stderr') => void
  onStep: (step: StepId, state: 'active' | 'done') => void
  onProgress: (pct: number) => void
  onSession?: (sessionId: string) => void
  /** Each assistant message; the manager keeps the last one for the review chat. */
  onMessage?: (text: string) => void
  onExit: (code: number) => void
}

export interface AgentController {
  kill: () => void
}

export interface AgentRunOpts {
  worktreePath: string
  prompt: string
  /** Resume a prior session for a follow-up turn, if the agent supports it. */
  sessionId?: string
  /** 'plan' = read-only, just produce a plan; 'build' (default) = make changes. */
  mode?: 'plan' | 'build'
  /** Specific model to use (empty/undefined = the agent's configured default). */
  model?: string
}

export interface AgentModel {
  id: string
  label: string
}

export interface CodingAgent {
  id: CodingAgentId
  label: string
  /** Selectable models within this agent ('' = default). First entry is the default. */
  models: AgentModel[]
  probe(): Promise<{ installed: boolean; version: string | null }>
  run(opts: AgentRunOpts, h: AgentHandlers): AgentController
}

/** Canonical step order + advisory progress checkpoints (shared by all agents). */
export const STEP_ORDER: StepId[] = ['cloning', 'planning', 'editing', 'testing', 'pr']
export const STEP_PCT: Record<StepId, number> = { cloning: 10, planning: 30, editing: 65, testing: 90, pr: 100 }

/** A monotonic stepper: advances through the canonical steps, never going back. */
export function makeStepper(h: AgentHandlers) {
  const reached: Record<StepId, boolean> = { cloning: false, planning: false, editing: false, testing: false, pr: false }
  return (step: StepId) => {
    if (reached[step]) return
    reached[step] = true
    h.onStep(step, 'active')
    h.onProgress(STEP_PCT[step])
  }
}

// NOTE: the registry (AGENTS / getAgent / probeAgents) lives in agentRegistry.ts.
// This module stays a leaf (types + helper only) so codex.ts / claude.ts can
// import from it without a circular dependency.
