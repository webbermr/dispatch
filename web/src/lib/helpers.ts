import type { CardType, DiffFile } from '../store/types'

export interface DiffStats {
  add: number
  del: number
  files: number
}

export function diffStats(diff: DiffFile[] = []): DiffStats {
  return diff.reduce(
    (acc, f) => ({ add: acc.add + (f.add || 0), del: acc.del + (f.del || 0), files: acc.files + 1 }),
    { add: 0, del: 0, files: 0 },
  )
}

/** Branch slug from card type + title, e.g. `feat/share-a-trail`. */
export function branchSlug(title: string, type: CardType): string {
  const prefix = type === 'bug' ? 'fix' : type === 'enhancement' ? 'enh' : 'feat'
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28)
  return `${prefix}/${slug}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function titleCase(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}
