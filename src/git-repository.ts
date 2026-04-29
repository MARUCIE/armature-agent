import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

export function getGitRepositoryRoot(cwd: string): string | undefined {
  try {
    const output = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    }).trim()
    return output ? resolve(output) : undefined
  } catch {
    return undefined
  }
}
