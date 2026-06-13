import { existsSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'

/** Resolve symlinks where the path exists; otherwise resolve lexically. */
function canonical(p: string): string {
  const abs = resolve(p)
  try {
    return existsSync(abs) ? realpathSync(abs) : abs
  } catch {
    return abs
  }
}

/**
 * True iff `target` lives inside one of the approved `roots` — guards against
 * `..` traversal and symlink escapes (spec §8.6).
 */
export function isPathContained(target: string, roots: string[]): boolean {
  const t = canonical(target)
  return roots.some((root) => {
    const r = canonical(root)
    return t === r || t.startsWith(r + sep)
  })
}
