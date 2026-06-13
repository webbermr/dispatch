// Minimal leveled logger. Loopback daemon — plain stdout/stderr is enough.

const ts = () => new Date().toISOString().slice(11, 19)

export const log = {
  info: (...args: unknown[]) => console.log(`[${ts()}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${ts()}] WARN`, ...args),
  error: (...args: unknown[]) => console.error(`[${ts()}] ERROR`, ...args),
}
