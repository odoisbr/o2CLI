import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defineSkill, type SystemDesign, type DomainSummary } from '@o2/shared'
import { makeGatewayClient } from '../utils/gateway-client'
import { queryChunks } from '../utils/vector-store'
import { hashFile, writeLock, isLockValid } from '../utils/lock'

interface PlanInputs {
  projectName: string
  memoryPath: string
  workspacePath: string
  force?: boolean
}

interface PlanOutputs {
  design: SystemDesign
  designMdPath: string
  designJsonPath: string
  skipped: boolean
}

const QUERY_PROMPTS = [
  'entidades agregados regras de negócio',
  'casos de uso fluxo do usuário',
  'restrições validações integridade de dados',
  'relacionamentos entre entidades',
]

export const o2PlanSkill = defineSkill<PlanInputs, PlanOutputs>({
  name: 'o2-plan',
  mode: 'executor',
  description: 'Gera system-design.md e system-design.json a partir do domínio vetorizado',

  async execute(ctx, inputs) {
    const designDir = join(inputs.memoryPath, 'backend', '2-design')
    const summaryPath = join(designDir, 'domain-summary.md')
    const designMdPath = join(designDir, 'system-design.md')
    const designJsonPath = join(designDir, 'system-design.json')

    // Exige que o2-ingest já tenha sido executado
    if (!existsSync(summaryPath)) {
      throw new Error(
        `domain-summary.md não encontrado em ${designDir}.\n` +
        `Execute \`o2 run ingest --project ${inputs.projectName}\` antes.`
      )
    }

    // Verifica se o plano já está atualizado (lock baseado no domain-summary.md)
    const summaryHash = hashFile(summaryPath)!
    if (!inputs.force && isLockValid(inputs.workspacePath, 'o2-plan', summaryHash)) {
      const design = JSON.parse(readFileSync(designJsonPath, 'utf-8')) as SystemDesign
      return { design, designMdPath, designJsonPath, skipped: true }
    }

    const gateway = makeGatewayClient(ctx.engine)

    const alive = await gateway.health()
    if (!alive) throw new Error(`Gateway inacessível em ${ctx.engine.gatewayUrl}.`)

    // Lê o sumário estruturado (salvo como JSON pelo o2-ingest via gateway response)
    // Fallback: tenta ler domain-summary.json, senão reconstrói do markdown
    const summaryJsonPath = join(designDir, 'domain-summary.json')
    const domainSummary: DomainSummary = existsSync(summaryJsonPath)
      ? JSON.parse(readFileSync(summaryJsonPath, 'utf-8'))
      : parseSummaryFromMarkdown(readFileSync(summaryPath, 'utf-8'))

    // RAG: recupera chunks mais relevantes do ChromaDB para enriquecer o contexto
    const contextChunks: string[] = []
    for (const query of QUERY_PROMPTS) {
      const results = await queryChunks(inputs.projectName, query, gateway, 5)
      contextChunks.push(...results.map((r) => r.content))
    }

    // Deduplica chunks por conteúdo
    const uniqueContext = [...new Map(contextChunks.map((c) => [c, c])).values()].slice(0, 20)

    const response = await gateway.executeSkill<SystemDesign>({
      skill: 'o2-plan',
      projectName: inputs.projectName,
      inputs: {
        domainSummary,
        domainContext: uniqueContext,
        stack: ctx.config.stack,
        model: ctx.config.agent.model,
      },
    })

    if (!response.success) throw new Error('Gateway retornou erro na geração do system design')

    const design = response.outputs

    // Persiste JSON (input do o2-contract) e Markdown (legível por humanos)
    writeFileSync(designJsonPath, JSON.stringify(design, null, 2))
    writeFileSync(designMdPath, formatDesignMarkdown(design, ctx.config.stack))

    // Atualiza o lock com hash do domain-summary.md
    writeLock(inputs.workspacePath, 'o2-plan', summaryHash)

    return { design, designMdPath, designJsonPath, skipped: false }
  },
})

// Reconstrói um DomainSummary mínimo a partir do markdown caso o JSON não exista
function parseSummaryFromMarkdown(md: string): DomainSummary {
  return {
    executiveSummary: md.slice(0, 1000),
    entities: [],
    boundedContexts: [],
    useCases: [],
    ubiquitousLanguage: [],
  }
}

function formatDesignMarkdown(
  design: SystemDesign,
  stack: { runtime: string; framework: string; orm?: string; database?: string }
): string {
  const stackLine = [stack.runtime, stack.framework, stack.orm, stack.database]
    .filter(Boolean)
    .join(' + ')

  const lines: string[] = [
    '# System Design',
    '',
    `> Gerado em: ${new Date().toISOString()} | Stack: ${stackLine}`,
    '',
    '## Visão Geral',
    '',
    design.overview,
    '',
    '## Infraestrutura',
    '',
    `| Componente | Valor |`,
    `|------------|-------|`,
    `| Database | ${design.infrastructure.database} |`,
    `| Cache | ${design.infrastructure.cache ? 'Sim' : 'Não'} |`,
    `| Queue | ${design.infrastructure.queue ? 'Sim' : 'Não'} |`,
    `| File Storage | ${design.infrastructure.fileStorage ? 'Sim' : 'Não'} |`,
    `| Auth | ${design.infrastructure.auth} |`,
    '',
    '## Bounded Contexts e APIs',
    '',
    ...design.boundedContexts.flatMap((bc) => [
      `### ${bc.name} \`${bc.routePrefix}\``,
      '',
      bc.description,
      '',
      '**Entidades:** ' + bc.entities.join(', '),
      '',
      '| Método | Rota | Auth | Descrição |',
      '|--------|------|------|-----------|',
      ...bc.apis.map(
        (a) => `| \`${a.method}\` | \`${bc.routePrefix}${a.path}\` | ${a.requiresAuth ? '🔒' : '🔓'} | ${a.description} |`
      ),
      '',
    ]),
    '## Modelo de Dados',
    '',
    ...design.dataModel.flatMap((entity) => [
      `### ${entity.entity} (\`${entity.tableName}\`)`,
      '',
      `**Contexto:** ${entity.context}`,
      '',
      '| Campo | Tipo | Obrigatório | Descrição |',
      '|-------|------|-------------|-----------|',
      ...entity.fields.map(
        (f) => `| \`${f.name}\` | ${f.type} | ${f.required ? 'Sim' : 'Não'} | ${f.description} |`
      ),
      '',
      entity.relations.length > 0
        ? '**Relações:** ' + entity.relations.map((r) => `${r.entity} (${r.type})`).join(', ')
        : '',
      '',
    ]),
  ]

  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}
