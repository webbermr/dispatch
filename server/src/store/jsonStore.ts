import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DATA_PATH } from '../config.js'
import { type Db, EMPTY_DB } from './types.js'

/**
 * A tiny typed collection over an in-memory array, persisted via the parent store.
 * Each collection maps 1:1 to a future Postgres table — swapping in a pg-backed Store
 * means reimplementing this surface, not touching the routes.
 */
export class Collection<T extends { id: string }> {
  constructor(
    private rows: T[],
    private save: () => void,
  ) {}

  all(): T[] {
    return this.rows
  }
  byId(id: string): T | undefined {
    return this.rows.find((r) => r.id === id)
  }
  where(pred: (r: T) => boolean): T[] {
    return this.rows.filter(pred)
  }
  find(pred: (r: T) => boolean): T | undefined {
    return this.rows.find(pred)
  }
  insert(row: T): T {
    this.rows.push(row)
    this.save()
    return row
  }
  update(id: string, patch: Partial<T>): T | undefined {
    const row = this.byId(id)
    if (!row) return undefined
    Object.assign(row, patch)
    this.save()
    return row
  }
  delete(id: string): boolean {
    const i = this.rows.findIndex((r) => r.id === id)
    if (i < 0) return false
    this.rows.splice(i, 1)
    this.save()
    return true
  }
  deleteWhere(pred: (r: T) => boolean): number {
    const before = this.rows.length
    const kept = this.rows.filter((r) => !pred(r))
    if (kept.length !== before) {
      this.rows.length = 0
      this.rows.push(...kept)
      this.save()
    }
    return before - kept.length
  }
}

/** JSON-file-backed store for development. Production target: Postgres (same surface). */
export class JsonStore {
  private db: Db
  readonly users: Collection<Db['users'][number]>
  readonly workspaces: Collection<Db['workspaces'][number]>
  readonly memberships: Collection<Db['memberships'][number]>
  readonly repos: Collection<Db['repos'][number]>
  readonly cards: Collection<Db['cards'][number]>
  readonly comments: Collection<Db['comments'][number]>
  readonly sessions: Collection<Db['sessions'][number]>
  readonly runnerTokens: Collection<Db['runnerTokens'][number]>
  readonly runs: Collection<Db['runs'][number]>

  constructor() {
    this.db = this.load()
    const save = () => this.persist()
    this.users = new Collection(this.db.users, save)
    this.workspaces = new Collection(this.db.workspaces, save)
    this.memberships = new Collection(this.db.memberships, save)
    this.repos = new Collection(this.db.repos, save)
    this.cards = new Collection(this.db.cards, save)
    this.comments = new Collection(this.db.comments, save)
    this.sessions = new Collection(this.db.sessions, save)
    this.runnerTokens = new Collection(this.db.runnerTokens, save)
    this.runs = new Collection(this.db.runs, save)
  }

  private load(): Db {
    try {
      if (existsSync(DATA_PATH)) return { ...EMPTY_DB, ...(JSON.parse(readFileSync(DATA_PATH, 'utf8')) as Partial<Db>) }
    } catch {
      /* fall through to empty */
    }
    return structuredClone(EMPTY_DB)
  }

  private persist(): void {
    const dir = dirname(DATA_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const tmp = `${DATA_PATH}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(this.db, null, 2), 'utf8')
    renameSync(tmp, DATA_PATH)
  }
}

export const store = new JsonStore()
