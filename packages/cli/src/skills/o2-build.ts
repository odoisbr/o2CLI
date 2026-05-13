import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defineSkill, type SystemDesign } from '@o2/shared'
import { computeContractHash, writeLock, isLockValid } from '../utils/lock'
import {
  buildDrizzleClientFile,
  buildDrizzleConfig,
  buildDrizzleSchemaFile,
  buildEnvExample,
  buildEnvFile,
  buildErrorSchemaFile,
  buildGeneratedReadme,
  buildGitignore,
  buildHandlersFile,
  buildPackageJson,
  buildRoutesFile,
  buildRoutesIndexFile,
  buildServerFile,
  buildTsconfig,
  buildZodSchemaFile,
  kebabCase,
  pascalCase,
} from '../utils/code-builder'

interface BuildInputs {
  projectName: string
  memoryPath: string
  workspacePath: string
  force?: boolean
}

interface BuildOutputs {
  filesWritten: number
  filesSkipped: number
  generatedPath: string
  skipped: boolean
}

const SUPPORTED_STACK = {
  runtime: 'bun',
  framework: 'fastify',
  orm: 'drizzle',
  database: 'postgresql',
} as const

function assertStackSupported(stack: { runtime: string; framework: string; orm?: string; database?: string }): void {
  const mismatches: string[] = []
  if (stack.runtime !== SUPPORTED_STACK.runtime) mismatches.push(`runtime=${stack.runtime} (esperado ${SUPPORTED_STACK.runtime})`)
  if (stack.framework !== SUPPORTED_STACK.framework) mismatches.push(`framework=${stack.framework} (esperado ${SUPPORTED_STACK.framework})`)
  if (stack.orm !== SUPPORTED_STACK.orm) mismatches.push(`orm=${stack.orm ?? 'none'} (esperado ${SUPPORTED_STACK.orm})`)
  if (stack.database !== SUPPORTED_STACK.database) mismatches.push(`database=${stack.database ?? 'none'} (esperado ${SUPPORTED_STACK.database})`)

  if (mismatches.length > 0) {
    throw new Error(
      `Stack do projeto incompatível com o2-build v1.\n` +
      `Suportado: ${SUPPORTED_STACK.runtime}+${SUPPORTED_STACK.framework}+${SUPPORTED_STACK.orm}+${SUPPORTED_STACK.database}\n` +
      `Divergências: ${mismatches.join('; ')}`
    )
  }
}

function writeIfMissing(path: string, content: string, counts: { written: number; skipped: number }): void {
  if (existsSync(path)) {
    counts.skipped++
    return
  }
  writeFileSync(path, content)
  counts.written++
}

function writeAlways(path: string, content: string, counts: { written: number; skipped: number }): void {
  writeFileSync(path, content)
  counts.written++
}

export const o2BuildSkill = defineSkill<BuildInputs, BuildOutputs>({
  name: 'o2-build',
  mode: 'executor',
  description: 'Gera skeleton funcional do serviço a partir do openapi.yaml + system-design.json',

  async execute(ctx, inputs) {
    assertStackSupported(ctx.config.stack)

    const openapiPath = join(inputs.workspacePath, 'openapi.yaml')
    const designJsonPath = join(inputs.memoryPath, 'backend', '2-design', 'system-design.json')

    if (!existsSync(openapiPath) || !existsSync(designJsonPath)) {
      throw new Error(
        `Artefatos do contrato não encontrados.\n` +
        `Execute \`o2 run contract --project ${inputs.projectName}\` antes.`
      )
    }

    const contractHash = computeContractHash(inputs.workspacePath, inputs.memoryPath)!
    if (!inputs.force && isLockValid(inputs.workspacePath, 'o2-build', contractHash)) {
      return {
        filesWritten: 0,
        filesSkipped: 0,
        generatedPath: join(inputs.workspacePath, 'generated'),
        skipped: true,
      }
    }

    const design = JSON.parse(readFileSync(designJsonPath, 'utf-8')) as SystemDesign

    const generatedPath = join(inputs.workspacePath, 'generated')
    // Sempre limpa generated/ antes de regerar — esta pasta é 100% derivada
    if (existsSync(generatedPath)) rmSync(generatedPath, { recursive: true, force: true })

    // Estrutura de pastas
    mkdirSync(join(generatedPath, 'routes'), { recursive: true })
    mkdirSync(join(generatedPath, 'handlers'), { recursive: true })
    mkdirSync(join(generatedPath, 'schemas'), { recursive: true })
    mkdirSync(join(generatedPath, 'db', 'migrations'), { recursive: true })

    const counts = { written: 0, skipped: 0 }

    // --- Arquivos em generated/ (sempre sobrescritos) ---

    writeAlways(join(generatedPath, 'server.ts'), buildServerFile(design), counts)
    writeAlways(join(generatedPath, 'env.ts'), buildEnvFile(design), counts)
    writeAlways(join(generatedPath, 'README.md'), buildGeneratedReadme(design), counts)

    writeAlways(join(generatedPath, 'db', 'schema.ts'), buildDrizzleSchemaFile(design), counts)
    writeAlways(join(generatedPath, 'db', 'client.ts'), buildDrizzleClientFile(), counts)

    // Schemas Zod — uma export central + um arquivo por entidade
    const schemaExports: string[] = [`export * from './error.schema'`]
    writeAlways(join(generatedPath, 'schemas', 'error.schema.ts'), buildErrorSchemaFile(), counts)

    for (const entity of design.dataModel) {
      const filename = `${kebabCase(entity.entity)}.schema.ts`
      writeAlways(join(generatedPath, 'schemas', filename), buildZodSchemaFile(entity), counts)
      schemaExports.push(`export * from './${kebabCase(entity.entity)}.schema'`)
    }

    writeAlways(
      join(generatedPath, 'schemas', 'index.ts'),
      schemaExports.join('\n') + '\n',
      counts,
    )

    // Routes + handlers por bounded context
    for (const bc of design.boundedContexts) {
      const slug = kebabCase(bc.name)
      writeAlways(join(generatedPath, 'routes', `${slug}.routes.ts`), buildRoutesFile(bc), counts)
      writeAlways(join(generatedPath, 'handlers', `${slug}.handlers.ts`), buildHandlersFile(bc), counts)
    }
    writeAlways(join(generatedPath, 'routes', 'index.ts'), buildRoutesIndexFile(design), counts)

    // --- Arquivos da raiz do workspace (só cria se não existir) ---

    writeIfMissing(join(inputs.workspacePath, 'package.json'), buildPackageJson(inputs.projectName, design), counts)
    writeIfMissing(join(inputs.workspacePath, 'tsconfig.json'), buildTsconfig(), counts)
    writeIfMissing(join(inputs.workspacePath, 'drizzle.config.ts'), buildDrizzleConfig(), counts)
    writeIfMissing(join(inputs.workspacePath, '.env.example'), buildEnvExample(design), counts)
    writeIfMissing(join(inputs.workspacePath, '.gitignore'), buildGitignore(), counts)

    writeLock(inputs.workspacePath, 'o2-build', contractHash)

    return {
      filesWritten: counts.written,
      filesSkipped: counts.skipped,
      generatedPath,
      skipped: false,
    }
  },
})

// Re-export para conveniência em consumidores que querem inspecionar a stack alvo
export { SUPPORTED_STACK, pascalCase }
