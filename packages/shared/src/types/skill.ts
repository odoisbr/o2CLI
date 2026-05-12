import type { O2Config, EngineConfig } from './config'

export type SkillMode = 'executor' | 'compiler'

export type SkillName =
  | 'o2-ingest'
  | 'o2-plan'
  | 'o2-contract'
  | 'o2-build'
  | 'o2-infra'
  | 'o2-docs'
  | 'o2-audit'

export interface ExecutionContext {
  config: O2Config
  engine: EngineConfig
  workspacePath: string
  memoryPath: string
}

export interface SkillDefinition<I = unknown, O = unknown> {
  name: SkillName
  mode: SkillMode
  description: string
  execute: (ctx: ExecutionContext, inputs: I) => Promise<O>
}

export function defineSkill<I, O>(def: SkillDefinition<I, O>): SkillDefinition<I, O> {
  return def
}
