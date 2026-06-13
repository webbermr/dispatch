import { randomBytes } from 'node:crypto'
import { loadPairings, savePairings } from './config.js'
import { log } from './lib/log.js'

/** Crockford-ish base32 (no ambiguous chars) for the human-typed pairing code. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function group(n: number): string {
  let s = ''
  const bytes = randomBytes(n)
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] % ALPHABET.length]
  return s
}

/** A one-time pairing code shown in the CLI, e.g. `7F3A-29C1`. */
export function generatePairingCode(): string {
  return `${group(4)}-${group(4)}`
}

export class PairingManager {
  /** The currently-valid one-time code (cleared once redeemed). */
  private code: string | null
  private tokens: Set<string>

  constructor(code: string) {
    this.code = code
    this.tokens = new Set(loadPairings())
  }

  /** Exchange a one-time code for a long-lived bearer token. */
  redeem(code: string): { ok: true; token: string } | { ok: false; error: string } {
    if (!this.code) return { ok: false, error: 'no pairing code is active' }
    if (code.trim().toUpperCase() !== this.code) return { ok: false, error: 'invalid pairing code' }
    const token = randomBytes(32).toString('hex')
    this.tokens.add(token)
    savePairings([...this.tokens])
    this.code = null // one-time: invalidate after a successful pair
    log.info('paired a new client; token issued')
    return { ok: true, token }
  }

  isValid(token: string | undefined): boolean {
    return !!token && this.tokens.has(token)
  }

  revoke(token: string): void {
    this.tokens.delete(token)
    savePairings([...this.tokens])
  }

  /** Whether any client has ever paired (drives "already paired" UX). */
  get hasTokens(): boolean {
    return this.tokens.size > 0
  }
}
