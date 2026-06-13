// Map agent (REST/WS) payloads onto the web store's App / Card shapes, so the UI
// components are identical whether data comes from the demo seed or the agent.

import type { AgentApp, AgentCard, AgentRun } from './agentClient'
import type { App, Card, CardStatus, ChatMessage, DiffFile } from '../store/types'

const ACCENTS = ['var(--brand-primary)', 'var(--color-navy)', 'var(--color-blue2-dark)', 'var(--color-purple-dark)']

export function mapApp(a: AgentApp, index: number): App {
  return {
    id: a.id,
    name: a.name,
    repo: a.repoSlug || a.localPath,
    stack: a.localPath,
    cloned: a.cloned,
    base: a.defaultBranch,
    accent: ACCENTS[index % ACCENTS.length],
    mergeStrategy: a.mergeStrategy,
    hasRemote: a.hasRemote,
  }
}

const STEP_LABEL: Record<string, string> = {
  cloning: 'Cloning context',
  planning: 'Planning changes',
  editing: 'Editing files',
  testing: 'Running tests',
  pr: 'Opening pull request',
}

export function currentStepLabel(run: Pick<AgentRun, 'steps' | 'progress' | 'status'>): string {
  if (run.status === 'needs_review' || run.status === 'merged' || run.progress >= 100) return 'Done'
  const active = run.steps.find((s) => s.state === 'active')
  return active ? STEP_LABEL[active.id] ?? '' : 'Queued'
}

/** Run status → board column status (mirror of the agent's runStatusToCard). */
export function runStatusToCard(s: AgentRun['status']): CardStatus {
  if (s === 'needs_review') return 'review'
  if (s === 'merged') return 'merged'
  if (s === 'building') return 'building'
  return 'ready'
}

function mapChat(run: AgentRun): ChatMessage[] {
  return run.chat.map((m) => ({ role: m.role, text: m.text }))
}

function mapDiff(run: AgentRun): DiffFile[] {
  return run.diff
}

/** Join an agent card with its (optional) run into a web Card. */
export function mapCard(c: AgentCard, run?: AgentRun): Card {
  const card: Card = {
    id: c.id,
    appId: c.appId,
    type: c.type,
    priority: c.priority,
    status: c.status,
    title: c.title,
    desc: c.desc,
    prompt: c.prompt,
    branch: c.branch ?? run?.branch,
    runId: c.runId,
    mergedAt: c.mergedAt,
    prUrl: c.prUrl ?? run?.prUrl,
  }
  if (run) {
    card.build = { progress: run.progress, currentStep: currentStepLabel(run), logs: run.logs }
    if (run.diff.length) card.diff = mapDiff(run)
    if (run.chat.length) card.chat = mapChat(run)
  }
  return card
}
