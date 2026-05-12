import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import type { Provider, TokenUsage } from '@o2/shared'

export interface LLMRequest {
  provider: Provider
  model: string
  prompt: string
  system?: string
}

export interface LLMResult {
  text: string
  usage: TokenUsage
  provider: Provider
  model: string
  durationMs: number
}

// Custo aproximado por 1M tokens (prompt/completion) em USD
const COST_PER_M: Record<string, [number, number]> = {
  'claude-opus-4-7': [15, 75],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [0.25, 1.25],
  'gpt-4o': [5, 15],
  'gpt-4o-mini': [0.15, 0.6],
  'o3-mini': [1.1, 4.4],
}

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates = COST_PER_M[model]
  if (!rates) return 0
  return (promptTokens * rates[0] + completionTokens * rates[1]) / 1_000_000
}

// Circuit breaker por provider (em memória — stateless entre restarts)
type BreakerState = 'closed' | 'open' | 'half-open'
const breakers: Record<Provider, { state: BreakerState; failures: number; openUntil: number }> = {
  anthropic: { state: 'closed', failures: 0, openUntil: 0 },
  openai: { state: 'closed', failures: 0, openUntil: 0 },
  vertex: { state: 'closed', failures: 0, openUntil: 0 },
}

const FAILURE_THRESHOLD = 3
const OPEN_DURATION_MS = 30_000

function isProviderAvailable(provider: Provider): boolean {
  const b = breakers[provider]
  if (b.state === 'closed') return true
  if (b.state === 'open') {
    if (Date.now() > b.openUntil) {
      b.state = 'half-open'
      return true
    }
    return false
  }
  return true // half-open: tenta uma vez
}

function recordSuccess(provider: Provider): void {
  breakers[provider] = { state: 'closed', failures: 0, openUntil: 0 }
}

function recordFailure(provider: Provider): void {
  const b = breakers[provider]
  b.failures++
  if (b.failures >= FAILURE_THRESHOLD) {
    b.state = 'open'
    b.openUntil = Date.now() + OPEN_DURATION_MS
  }
}

function getFallback(primary: Provider): Provider | null {
  const order: Provider[] = ['anthropic', 'openai', 'vertex']
  return order.find((p) => p !== primary && isProviderAvailable(p)) ?? null
}

async function callProvider(req: LLMRequest): Promise<LLMResult> {
  const start = Date.now()

  const model = req.provider === 'anthropic'
    ? anthropic(req.model)
    : openai(req.model)

  const result = await generateText({
    model,
    prompt: req.prompt,
    system: req.system,
  })

  const durationMs = Date.now() - start
  const promptTokens = result.usage.promptTokens
  const completionTokens = result.usage.completionTokens

  return {
    text: result.text,
    usage: {
      promptTokens,
      completionTokens,
      costUsd: estimateCost(req.model, promptTokens, completionTokens),
    },
    provider: req.provider,
    model: req.model,
    durationMs,
  }
}

export async function executeLLM(req: LLMRequest): Promise<LLMResult> {
  if (!isProviderAvailable(req.provider)) {
    const fallback = getFallback(req.provider)
    if (!fallback) throw new Error(`Todos os provedores indisponíveis`)

    // fallback usa o modelo padrão do provider alternativo
    const fallbackModels: Record<Provider, string> = {
      anthropic: 'claude-sonnet-4-6',
      openai: 'gpt-4o-mini',
      vertex: 'gemini-2.0-flash',
    }

    req = { ...req, provider: fallback, model: fallbackModels[fallback] }
  }

  try {
    const result = await callProvider(req)
    recordSuccess(req.provider)
    return result
  } catch (err) {
    recordFailure(req.provider)
    throw err
  }
}
