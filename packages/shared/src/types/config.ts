export type Provider = 'anthropic' | 'openai' | 'vertex'
export type InterfaceMode = 'claude-code' | 'cursor' | 'cline' | 'clipboard'
export type ProjectMode = 'hybrid' | 'api' | 'compiler'

export interface EngineConfig {
  version: string
  gatewayUrl: string
  apiKey: string
  defaultInterface: InterfaceMode
  createdAt: string
}

export interface O2Config {
  version: string
  project: {
    name: string
    mode: ProjectMode
    createdAt: string
  }
  stack: {
    runtime: string
    framework: string
    orm?: string
    database?: string
  }
  paths: {
    workspace: string
    memory: string
  }
  agent: {
    provider: Provider
    model: string
    quotaUsd?: number
  }
}
