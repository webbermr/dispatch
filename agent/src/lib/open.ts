import { spawn } from 'node:child_process'
import { run } from './git.js'

/**
 * Open a folder in the user's editor (preferred) or file manager. Tries, in
 * order: $DISPATCH_EDITOR, cursor, code, then the OS file manager. Returns the
 * tool used, or null if nothing worked.
 */
export async function openPath(path: string): Promise<string | null> {
  const editors = [process.env.DISPATCH_EDITOR, 'cursor', 'code'].filter(Boolean) as string[]
  for (const ed of editors) {
    // `--version` confirms the launcher exists on PATH before we try to use it.
    if ((await run(ed, ['--version'])).code === 0) {
      spawn(ed, [path], { stdio: 'ignore', detached: true }).unref()
      return ed
    }
  }
  const fileManager = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  try {
    spawn(fileManager, [path], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref()
    return fileManager
  } catch {
    return null
  }
}
