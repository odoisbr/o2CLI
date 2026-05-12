import { embedMany } from 'ai'
import { openai } from '@ai-sdk/openai'

const EMBEDDING_MODEL = 'text-embedding-3-small'
// custo: $0.02 / 1M tokens
const COST_PER_M_TOKENS = 0.02

export interface EmbeddingsResult {
  embeddings: number[][]
  model: string
  usage: {
    promptTokens: number
    costUsd: number
  }
}

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingsResult> {
  const { embeddings, usage } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: texts,
  })

  return {
    embeddings,
    model: EMBEDDING_MODEL,
    usage: {
      promptTokens: usage.tokens,
      costUsd: (usage.tokens * COST_PER_M_TOKENS) / 1_000_000,
    },
  }
}
