import type { Card, Comment } from './store/types.js'

/** Slim run state pushed to the board (full logs/diff fetched via GET /runs/:id). */
export interface RunSummary {
  id: string
  cardId: string
  status: string
  progress: number
  branch?: string
  prUrl?: string
}

/** Events fanned out to everyone viewing a repo's board (mirrors the agent's model). */
export type BoardEvent =
  | { type: 'card.update'; repoId: string; card: Card }
  | { type: 'card.remove'; repoId: string; cardId: string }
  | { type: 'comment.create'; repoId: string; cardId: string; comment: Comment }
  | { type: 'run.update'; repoId: string; run: RunSummary }

type Sink = (ev: BoardEvent) => void

/** Per-repo pub/sub. Browsers subscribe to a repo channel; publishers broadcast to all. */
class Bus {
  private channels = new Map<string, Set<Sink>>()

  subscribe(repoId: string, sink: Sink): () => void {
    let set = this.channels.get(repoId)
    if (!set) {
      set = new Set()
      this.channels.set(repoId, set)
    }
    set.add(sink)
    return () => {
      set!.delete(sink)
      if (set!.size === 0) this.channels.delete(repoId)
    }
  }

  publish(ev: BoardEvent): void {
    const set = this.channels.get(ev.repoId)
    if (!set) return
    for (const sink of set) {
      try {
        sink(ev)
      } catch {
        /* ignore a bad sink */
      }
    }
  }
}

export const bus = new Bus()
