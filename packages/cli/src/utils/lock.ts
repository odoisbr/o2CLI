import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const SKILL_VERSION = '0.0.1'

export interface LockEntry {
  hash: string
  skill: string
  skillVersion: string
  generatedAt: string
}

export function computeLockHash(workspacePath: string): string | null {
  const openapiPath = join(workspacePath, 'openapi.yaml')
  const designPath = join(workspacePath, '.o2', 'system-design.md')

  if (!existsSync(openapiPath) || !existsSync(designPath)) return null

  const content = readFileSync(openapiPath, 'utf-8') + readFileSync(designPath, 'utf-8') + SKILL_VERSION
  return createHash('sha256').update(content).digest('hex')
}

export function readLock(workspacePath: string): Record<string, LockEntry> {
  const lockPath = join(workspacePath, '.o2.lock')
  if (!existsSync(lockPath)) return {}
  return JSON.parse(readFileSync(lockPath, 'utf-8')) as Record<string, LockEntry>
}

export function writeLock(workspacePath: string, skill: string, hash: string): void {
  const lockPath = join(workspacePath, '.o2.lock')
  const lock = readLock(workspacePath)

  lock[skill] = {
    hash,
    skill,
    skillVersion: SKILL_VERSION,
    generatedAt: new Date().toISOString(),
  }

  writeFileSync(lockPath, JSON.stringify(lock, null, 2))
}

export function isLockValid(workspacePath: string, skill: string): boolean {
  const currentHash = computeLockHash(workspacePath)
  if (!currentHash) return false
  const lock = readLock(workspacePath)
  return lock[skill]?.hash === currentHash
}
