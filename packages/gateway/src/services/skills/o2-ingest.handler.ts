import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { DomainSummarySchema, type DomainSummary } from '@o2/shared'

export type { DomainSummary }

interface IngestInput {
  documents: Array<{ filename: string; content: string }>
  model?: string
}

interface IngestResult {
  summary: DomainSummary
  usage: { promptTokens: number; completionTokens: number }
  durationMs: number
}

export async function handleIngest(inputs: IngestInput): Promise<IngestResult> {
  const start = Date.now()

  const domainText = inputs.documents
    .map((d) => `### ${d.filename}\n\n${d.content}`)
    .join('\n\n---\n\n')

  const model = inputs.model ?? 'claude-sonnet-4-6'

  const { object, usage } = await generateObject({
    model: anthropic(model),
    schema: DomainSummarySchema,
    system: `Você é um especialista em Domain-Driven Design. Analise as regras de negócio fornecidas
e extraia as informações estruturadas com precisão. Não invente informações — baseie-se
estritamente no conteúdo fornecido. Use os nomes exatos do texto para entidades e termos.`,
    prompt: `Analise os seguintes documentos de domínio de negócio e extraia as informações estruturadas:\n\n${domainText}`,
  })

  return {
    summary: object,
    usage: {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    },
    durationMs: Date.now() - start,
  }
}
