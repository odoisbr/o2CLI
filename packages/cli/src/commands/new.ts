import * as p from '@clack/prompts'
import { join } from 'path'
import { engineExists, writeO2Config } from '../utils/config'
import { provisionWorkspace, provisionMemory } from '../utils/fs'
import type { O2Config, Provider, ProjectMode } from '@o2/shared'

const MODELS: Record<Provider, string[]> = {
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  vertex: ['gemini-2.0-flash', 'gemini-1.5-pro'],
}

export async function createNew(): Promise<void> {
  p.intro('o2 new — Criação de Projeto')

  if (!engineExists()) {
    p.cancel('Motor não configurado. Execute `o2 onboard` primeiro.')
    process.exit(1)
  }

  // --- Identidade do projeto ---
  const name = await p.text({
    message: 'Nome do projeto',
    placeholder: 'meu-projeto',
    validate: (v) => /^[a-z0-9-]+$/.test(v) ? undefined : 'Use apenas letras minúsculas, números e hífens',
  })
  if (p.isCancel(name)) { p.cancel('Abortado.'); return }

  const mode = await p.select<ProjectMode>({
    message: 'Modo de operação',
    options: [
      { value: 'hybrid', label: 'Híbrido — decide por skill (recomendado)' },
      { value: 'api', label: 'API — executor direto para todas as skills' },
      { value: 'compiler', label: 'Compilador — gera .o2-task.md para flat-fee' },
    ],
  })
  if (p.isCancel(mode)) { p.cancel('Abortado.'); return }

  // --- Stack ---
  p.note('Defina a stack do projeto gerado', 'Stack')

  const runtime = await p.select<string>({
    message: 'Runtime',
    options: [
      { value: 'bun', label: 'Bun (recomendado)' },
      { value: 'node', label: 'Node.js' },
    ],
  })
  if (p.isCancel(runtime)) { p.cancel('Abortado.'); return }

  const framework = await p.select<string>({
    message: 'Framework',
    options: [
      { value: 'fastify', label: 'Fastify' },
      { value: 'hono', label: 'Hono' },
      { value: 'express', label: 'Express' },
    ],
  })
  if (p.isCancel(framework)) { p.cancel('Abortado.'); return }

  const orm = await p.select<string>({
    message: 'ORM / Query Builder',
    options: [
      { value: 'prisma', label: 'Prisma' },
      { value: 'drizzle', label: 'Drizzle ORM' },
      { value: 'none', label: 'Nenhum' },
    ],
  })
  if (p.isCancel(orm)) { p.cancel('Abortado.'); return }

  const database = orm !== 'none'
    ? await p.select<string>({
        message: 'Banco de dados',
        options: [
          { value: 'postgresql', label: 'PostgreSQL' },
          { value: 'mysql', label: 'MySQL' },
          { value: 'sqlite', label: 'SQLite' },
        ],
      })
    : 'none'
  if (p.isCancel(database)) { p.cancel('Abortado.'); return }

  // --- Agente ---
  p.note('Configure o agente LLM', 'Agente')

  const provider = await p.select<Provider>({
    message: 'Provedor LLM',
    options: [
      { value: 'anthropic', label: 'Anthropic (Claude)' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'vertex', label: 'Google Vertex AI' },
    ],
  })
  if (p.isCancel(provider)) { p.cancel('Abortado.'); return }

  const modelOptions = MODELS[provider].map((m) => ({ value: m, label: m }))
  const model = await p.select<string>({
    message: 'Modelo padrão',
    options: modelOptions,
  })
  if (p.isCancel(model)) { p.cancel('Abortado.'); return }

  const quotaRaw = await p.text({
    message: 'Quota mensal em USD (opcional, Enter para pular)',
    placeholder: '50',
  })
  if (p.isCancel(quotaRaw)) { p.cancel('Abortado.'); return }

  const quotaUsd = quotaRaw ? parseFloat(quotaRaw as string) : undefined

  // --- Provisionamento ---
  const s = p.spinner()

  let workspacePath!: string
  let memoryPath!: string

  try {
    s.start('Criando workspace de código')
    workspacePath = provisionWorkspace(name as string)
    s.stop(`Workspace: ${workspacePath}`)

    s.start('Criando shadow workspace de memória')
    memoryPath = provisionMemory(name as string)
    s.stop(`Memória: ${memoryPath}`)
  } catch (err) {
    s.stop('Erro no provisionamento')
    p.cancel(String(err))
    process.exit(1)
  }

  const config: O2Config = {
    version: '1',
    project: {
      name: name as string,
      mode,
      createdAt: new Date().toISOString(),
    },
    stack: {
      runtime: runtime as string,
      framework: framework as string,
      orm: orm !== 'none' ? orm as string : undefined,
      database: database !== 'none' ? database as string : undefined,
    },
    paths: {
      workspace: workspacePath!,
      memory: memoryPath!,
    },
    agent: {
      provider,
      model: model as string,
      quotaUsd,
    },
  }

  s.start('Gravando o2.config.json')
  writeO2Config(workspacePath!, config)
  s.stop('Configuração gravada')

  p.outro(`
  Projeto "${name}" criado com sucesso!

  Workspace  → ${workspacePath}
  Memória    → ${memoryPath}

  Próximo passo: popule ${join(memoryPath!, 'backend', '1-domain')} com suas regras de negócio e execute:
  → o2 ingest --project ${name}
  `)
}
