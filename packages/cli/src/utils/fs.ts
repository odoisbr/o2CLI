import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

export const WWW_DIR = join(homedir(), 'www')
export const MEMORY_DIR = join(homedir(), 'memory-o2')

export function provisionWorkspace(projectName: string): string {
  const path = join(WWW_DIR, projectName)

  if (existsSync(path)) {
    throw new Error(`Workspace já existe: ${path}`)
  }

  mkdirSync(path, { recursive: true })
  execSync('git init', { cwd: path, stdio: 'ignore' })

  return path
}

export function provisionMemory(projectName: string): string {
  const base = join(MEMORY_DIR, projectName, 'backend')

  mkdirSync(join(base, '1-domain'), { recursive: true })
  mkdirSync(join(base, '2-design'), { recursive: true })
  mkdirSync(join(base, 'audit_logs'), { recursive: true })

  // .gitkeep para manter dirs vazios no git
  for (const dir of ['1-domain', '2-design', 'audit_logs']) {
    Bun.write(join(base, dir, '.gitkeep'), '')
  }

  return join(MEMORY_DIR, projectName)
}
