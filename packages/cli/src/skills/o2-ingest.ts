import * as p from '@clack/prompts'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { defineSkill, type DomainSummary } from '@o2/shared'
import { chunkMarkdown } from '../utils/chunker'
import { upsertChunks } from '../utils/vector-store'
import { makeGatewayClient } from '../utils/gateway-client'
import { readEngine } from '../utils/config'

interface IngestInputs {
  projectName: string
  memoryPath: string
}

interface IngestOutputs {
  chunksStored: number
  summaryPath: string
  summary: DomainSummary
}

export const o2IngestSkill = defineSkill<IngestInputs, IngestOutputs>({
  name: 'o2-ingest',
  mode: 'executor',
  description: 'Vetoriza regras de negócio do domínio local e gera sumário executivo',

  async execute(ctx, inputs) {
    const domainPath = join(inputs.memoryPath, 'backend', '1-domain')

    // Coleta arquivos markdown do domínio
    const files = readdirSync(domainPath)
      .filter((f) => extname(f) === '.md' && f !== '.gitkeep')

    if (files.length === 0) {
      throw new Error(
        `Nenhum arquivo .md encontrado em ${domainPath}.\n` +
        `Populate o diretório com as regras de negócio antes de executar o2-ingest.`
      )
    }

    const documents = files.map((filename) => ({
      filename,
      content: readFileSync(join(domainPath, filename), 'utf-8'),
    }))

    // Valida conteúdo mínimo (anti-alucinação: exige domínio substancial)
    const totalChars = documents.reduce((acc, d) => acc + d.content.length, 0)
    if (totalChars < 200) {
      throw new Error('Conteúdo de domínio insuficiente. Adicione regras de negócio antes de ingerir.')
    }

    const gateway = makeGatewayClient(ctx.engine)

    // Verifica gateway disponível
    const alive = await gateway.health()
    if (!alive) {
      throw new Error(`Gateway inacessível em ${ctx.engine.gatewayUrl}. Verifique se está rodando.`)
    }

    // Chunking semântico de todos os documentos
    const allChunks = documents.flatMap((d) => chunkMarkdown(d.content, d.filename))

    // Vetorização + persistência no ChromaDB local
    const { stored } = await upsertChunks(inputs.projectName, allChunks, gateway)

    // Geração do sumário executivo via gateway (generateObject estruturado)
    const response = await gateway.executeSkill<DomainSummary>({
      skill: 'o2-ingest',
      projectName: inputs.projectName,
      inputs: {
        documents,
        model: ctx.config.agent.model,
      },
    })

    if (!response.success) throw new Error('Gateway retornou erro na geração do sumário')

    const designDir = join(inputs.memoryPath, 'backend', '2-design')

    // Persiste JSON (consumido pelo o2-plan) e Markdown (legível por humanos)
    const summaryJsonPath = join(designDir, 'domain-summary.json')
    const summaryPath = join(designDir, 'domain-summary.md')
    writeFileSync(summaryJsonPath, JSON.stringify(response.outputs, null, 2))
    writeFileSync(summaryPath, formatSummaryMarkdown(response.outputs))

    return {
      chunksStored: stored,
      summaryPath,
      summary: response.outputs,
    }
  },
})

function formatSummaryMarkdown(summary: DomainSummary): string {
  const lines: string[] = [
    '# Sumário Executivo do Domínio',
    '',
    `> Gerado em: ${new Date().toISOString()}`,
    '',
    '## Visão Geral',
    '',
    summary.executiveSummary,
    '',
    '## Bounded Contexts',
    '',
    ...summary.boundedContexts.flatMap((bc) => [
      `### ${bc.name}`,
      '',
      ...bc.responsibilities.map((r) => `- ${r}`),
      '',
    ]),
    '## Entidades',
    '',
    ...summary.entities.flatMap((e) => [
      `### ${e.name}`,
      '',
      e.description,
      '',
      '**Atributos:**',
      ...e.attributes.map((a) => `- ${a}`),
      '',
    ]),
    '## Casos de Uso',
    '',
    ...summary.useCases.map((uc) => `- ${uc}`),
    '',
    '## Linguagem Ubíqua',
    '',
    '| Termo | Definição |',
    '|-------|-----------|',
    ...summary.ubiquitousLanguage.map((u) => `| **${u.term}** | ${u.definition} |`),
  ]

  return lines.join('\n')
}
