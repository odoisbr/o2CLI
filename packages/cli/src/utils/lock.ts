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

// Hash de qualquer arquivo — usado por cada skill para rastrear se seu input mudou
export function hashFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, 'utf-8')
  return createHash('sha256').update(content + SKILL_VERSION).digest('hex')
}

// Hash do par contrato (openapi.yaml + system-design.json) — usado pelo o2-build
export function computeContractHash(workspacePath: string, memoryPath: string): string | null {
  const openapiPath = join(workspacePath, 'openapi.yaml')
  const designPath = join(memoryPath, 'backend', '2-design', 'system-design.json')
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
  lock[skill] = { hash, skill, skillVersion: SKILL_VERSION, generatedAt: new Date().toISOString() }
  writeFileSync(lockPath, JSON.stringify(lock, null, 2))
}

export function isLockValid(workspacePath: string, skill: string, currentHash: string): boolean {
  const lock = readLock(workspacePath)
  return lock[skill]?.hash === currentHash
}
