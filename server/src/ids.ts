import { randomBytes } from 'node:crypto'

export const id = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'workspace'
