import type { DiffFile, DiffLine } from '../types.js'

/**
 * Parse `git diff --cached` output into the per-file shape the prototype's diff
 * viewer consumes. Binary/huge files become `{ file, add, del, lines: [] }`.
 */
export function parseUnifiedDiff(raw: string, maxLinesPerFile = 400): DiffFile[] {
  const files: DiffFile[] = []
  let cur: DiffFile | null = null
  let binary = false

  const push = () => {
    if (cur) {
      if (binary || cur.lines.length > maxLinesPerFile) cur.lines = []
      files.push(cur)
    }
  }

  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      push()
      // `diff --git a/path b/path` — take the b/ path.
      const m = line.match(/ b\/(.+)$/)
      cur = { file: m ? m[1] : line.slice('diff --git '.length), add: 0, del: 0, lines: [] }
      binary = false
      continue
    }
    if (!cur) continue

    if (line.startsWith('Binary files')) {
      binary = true
      continue
    }
    // Skip file-header noise.
    if (
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity index') ||
      line.startsWith('rename ')
    ) {
      continue
    }
    if (line.startsWith('@@')) {
      cur.lines.push({ t: 'ctx', text: line })
      continue
    }
    if (line.startsWith('+')) {
      cur.add++
      cur.lines.push({ t: 'add', text: line.slice(1) })
      continue
    }
    if (line.startsWith('-')) {
      cur.del++
      cur.lines.push({ t: 'del', text: line.slice(1) })
      continue
    }
    if (line.startsWith(' ') || line === '') {
      const l: DiffLine = { t: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line }
      cur.lines.push(l)
    }
  }
  push()
  return files
}
