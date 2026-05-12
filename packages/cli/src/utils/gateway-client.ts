import type { EngineConfig, SkillPayload, GatewayResponse, GatewayError, SkillName } from '@o2/shared'

export interface EmbeddingsResponse {
  embeddings: number[][]
  model: string
  usage: { promptTokens: number; costUsd: number }
}

type ApiResult<T> = T | GatewayError

async function request<T>(
  engine: EngineConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${engine.gatewayUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${engine.apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = (await res.json()) as ApiResult<T>

  if (!res.ok) {
    const err = data as GatewayError
    throw new Error(`[${err.code ?? res.status}] ${err.message ?? 'Erro desconhecido no gateway'}`)
  }

  return data as T
}

export function makeGatewayClient(engine: EngineConfig) {
  return {
    async executeSkill<O = unknown>(payload: SkillPayload): Promise<GatewayResponse<O>> {
      return request<GatewayResponse<O>>(engine, 'POST', '/v1/skills/execute', payload)
    },

    async generateEmbeddings(texts: string[]): Promise<EmbeddingsResponse> {
      return request<EmbeddingsResponse>(engine, 'POST', '/v1/embeddings', { texts })
    },

    async health(): Promise<boolean> {
      try {
        await request(engine, 'GET', '/health')
        return true
      } catch {
        return false
      }
    },
  }
}

export type GatewayClient = ReturnType<typeof makeGatewayClient>
