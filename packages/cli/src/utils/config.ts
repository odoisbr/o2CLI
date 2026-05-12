import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { EngineConfig, O2Config } from '@o2/shared'

const ENGINE_DIR = join(homedir(), '.o2')
const ENGINE_PATH = join(ENGINE_DIR, 'engine.json')

export function engineExists(): boolean {
  return existsSync(ENGINE_PATH)
}

export function readEngine(): EngineConfig {
  return JSON.parse(readFileSync(ENGINE_PATH, 'utf-8')) as EngineConfig
}

export function writeEngine(config: EngineConfig): void {
  mkdirSync(ENGINE_DIR, { recursive: true })
  writeFileSync(ENGINE_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function readO2Config(workspacePath: string): O2Config {
  const raw = readFileSync(join(workspacePath, 'o2.config.json'), 'utf-8')
  return JSON.parse(raw) as O2Config
}

export function writeO2Config(workspacePath: string, config: O2Config): void {
  writeFileSync(join(workspacePath, 'o2.config.json'), JSON.stringify(config, null, 2))
}

export const ENGINE_PATH_EXPORT = ENGINE_PATH
