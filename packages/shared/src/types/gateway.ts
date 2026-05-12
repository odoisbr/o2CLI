import type { SkillName, Provider } from './index'

export interface SkillPayload {
  skill: SkillName
  projectName: string
  inputs: Record<string, unknown>
  lockHash?: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  costUsd: number
}

export interface GatewayResponse<T = unknown> {
  success: true
  skill: SkillName
  outputs: T
  usage: TokenUsage
  provider: Provider
  model: string
  durationMs: number
}

export interface GatewayError {
  success: false
  code: string
  message: string
  skill?: SkillName
}
