// Map control-plane (server) shapes onto the store's App/Card shapes, so the SAME
// Board / Card / drawer components render team data unchanged.

import type { App, Card } from '../store/types'
import type { SCard, SRepo } from './serverClient'

const ACCENTS = ['var(--brand-primary)', 'var(--color-navy)', 'var(--color-blue2-dark)', 'var(--color-purple-dark)']

export function mapServerRepo(r: SRepo, index: number): App {
  return {
    id: r.id,
    name: r.name,
    repo: r.repoSlug || r.name,
    stack: '',
    cloned: true, // builds happen on a runner; don't gate dispatch on a local clone here
    base: r.defaultBranch,
    accent: ACCENTS[index % ACCENTS.length],
    repoMode: r.repoMode,
    hasRemote: r.repoMode === 'remote',
    forge: (r.forge as App['forge']) ?? 'other',
    mergeStrategy: r.repoMode === 'remote' ? 'pr' : 'merge',
  }
}

export function mapServerCard(c: SCard): Card {
  return {
    id: c.id,
    appId: c.repoId,
    type: c.type,
    priority: c.priority,
    status: c.status,
    title: c.title,
    desc: c.desc,
    prompt: c.prompt,
    base: c.base,
    model: c.model,
    order: c.order ?? c.createdAt,
    scaffold: c.scaffold,
    runId: c.runId,
  }
}
