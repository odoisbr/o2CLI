import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { SystemDesignSchema, type SystemDesign, type DomainSummary } from '@o2/shared'

interface PlanInputs {
  domainSummary: DomainSummary
  domainContext: string[]
  stack: {
    runtime: string
    framework: string
    orm?: string
    database?: string
  }
  model?: string
}

interface PlanResult {
  design: SystemDesign
  usage: { promptTokens: number; completionTokens: number }
  durationMs: number
}

export async function handlePlan(inputs: PlanInputs): Promise<PlanResult> {
  const start = Date.now()
  const model = inputs.model ?? 'claude-opus-4-7'

  const stackDescription = [
    `Runtime: ${inputs.stack.runtime}`,
    `Framework: ${inputs.stack.framework}`,
    inputs.stack.orm ? `ORM: ${inputs.stack.orm}` : null,
    inputs.stack.database ? `Database: ${inputs.stack.database}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  const contextSection = inputs.domainContext.length > 0
    ? `## Trechos relevantes do domínio (RAG)\n\n${inputs.domainContext.map((c, i) => `### Trecho ${i + 1}\n${c}`).join('\n\n')}`
    : ''

  const summarySection = `## Sumário do Domínio

### Visão Geral
${inputs.domainSummary.executiveSummary}

### Bounded Contexts identificados
${inputs.domainSummary.boundedContexts.map((bc) =>
    `**${bc.name}:** ${bc.responsibilities.join('; ')}`
  ).join('\n')}

### Entidades
${inputs.domainSummary.entities.map((e) =>
    `**${e.name}:** ${e.description} | Atributos: ${e.attributes.join(', ')}`
  ).join('\n')}

### Casos de Uso
${inputs.domainSummary.useCases.map((uc) => `- ${uc}`).join('\n')}

### Linguagem Ubíqua
${inputs.domainSummary.ubiquitousLanguage.map((u) => `- **${u.term}:** ${u.definition}`).join('\n')}`

  const prompt = `Você é um arquiteto de software sênior especializado em DDD e design de APIs REST.
Projete o system design completo para a aplicação descrita abaixo.

**Stack definida pelo time:** ${stackDescription}

${summarySection}

${contextSection}

**Regras obrigatórias:**
1. Cada bounded context vira um grupo de rotas com prefixo próprio
2. Respeite estritamente as entidades e regras identificadas no domínio — não invente entidades
3. Todos os campos do modelo de dados devem ter tipo compatível com ${inputs.stack.orm ?? inputs.stack.database ?? 'SQL'}
4. Defina rotas CRUD apenas onde o domínio justifica — não adicione endpoints desnecessários
5. Auth: se o domínio mencionar usuários/sessões/permissões, marque requiresAuth nos endpoints protegidos`

  const { object, usage } = await generateObject({
    model: anthropic(model),
    schema: SystemDesignSchema,
    prompt,
  })

  return {
    design: object,
    usage: {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    },
    durationMs: Date.now() - start,
  }
}
