import type { SystemDesign, ApiEndpoint, DataField } from '@o2/shared'

// Builders puros: SystemDesign -> strings de código TS.
// Sem LLM, sem efeitos colaterais. Cada função recebe input estruturado e devolve string.

// ============================================================================
// Helpers de nomenclatura
// ============================================================================

export function pascalCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

export function camelCase(input: string): string {
  const pascal = pascalCase(input)
  return pascal[0]?.toLowerCase() + pascal.slice(1)
}

export function kebabCase(input: string): string {
  return input
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
}

// Pluralização simples — suficiente para nomes técnicos comuns
function pluralize(noun: string): string {
  if (noun.endsWith('y') && !'aeiou'.includes(noun[noun.length - 2] ?? '')) {
    return noun.slice(0, -1) + 'ies'
  }
  if (noun.endsWith('s') || noun.endsWith('x') || noun.endsWith('ch') || noun.endsWith('sh')) {
    return noun + 'es'
  }
  return noun + 's'
}

// Detecta campos gerenciados pelo servidor — não devem aparecer no Input
function isServerManaged(name: string): boolean {
  return name === 'id' || name === 'createdAt' || name === 'updatedAt' || name === 'deletedAt'
}

// ============================================================================
// Zod schema (a partir de DataField[])
// ============================================================================

function zodTypeForField(type: string): string {
  const t = type.trim().toLowerCase()
  if (t.startsWith('enum:')) {
    const values = t.slice(5).split('|').map((v) => v.trim()).filter(Boolean)
    return `z.enum([${values.map((v) => `'${v}'`).join(', ')}])`
  }
  if (t === 'uuid' || /^[a-z]+id$/i.test(t)) return `z.string().uuid()`
  if (t === 'email') return `z.string().email()`
  if (t === 'url' || t === 'uri') return `z.string().url()`
  if (t === 'date') return `z.string().date()`
  if (t === 'datetime' || t === 'timestamp') return `z.string().datetime()`
  if (t === 'boolean' || t === 'bool') return `z.boolean()`
  if (t === 'int' || t === 'integer' || t === 'bigint' || t === 'long') return `z.number().int()`
  if (t === 'number' || t === 'float' || t === 'double' || t === 'decimal') return `z.number()`
  if (t === 'json' || t === 'object') return `z.record(z.unknown())`
  if (t === 'text' || t === 'string') return `z.string()`
  // Referência cruzada — mantém como objeto solto; o consumidor decide se faz $ref real
  if (/^[A-Z]/.test(type)) return `z.lazy(() => ${type}Schema)`
  return `z.string()`
}

export function buildZodSchemaFile(entity: SystemDesign['dataModel'][number]): string {
  const className = pascalCase(entity.entity)
  const fullLines: string[] = []
  const inputLines: string[] = []

  for (const field of entity.fields) {
    let base = zodTypeForField(field.type)
    if (!field.required) base += '.optional()'

    const line = `  ${field.name}: ${base}, // ${field.description}`
    fullLines.push(line)
    if (!isServerManaged(field.name)) inputLines.push(line)
  }

  return [
    `import { z } from 'zod'`,
    ``,
    `export const ${className}Schema = z.object({`,
    ...fullLines,
    `})`,
    ``,
    `export const ${className}InputSchema = z.object({`,
    ...inputLines,
    `})`,
    ``,
    `export type ${className} = z.infer<typeof ${className}Schema>`,
    `export type ${className}Input = z.infer<typeof ${className}InputSchema>`,
    ``,
  ].join('\n')
}

export function buildErrorSchemaFile(): string {
  return [
    `import { z } from 'zod'`,
    ``,
    `export const ErrorSchema = z.object({`,
    `  code: z.string(),`,
    `  message: z.string(),`,
    `  details: z.record(z.unknown()).optional(),`,
    `})`,
    ``,
    `export type ApiError = z.infer<typeof ErrorSchema>`,
    ``,
  ].join('\n')
}

// ============================================================================
// Drizzle schema (pgTable)
// ============================================================================

function drizzleColumnForField(field: DataField): { column: string; imports: Set<string> } {
  const t = field.type.trim().toLowerCase()
  const imports = new Set<string>()
  let col = ''

  if (field.name === 'id' && (t === 'uuid' || /^[a-z]+id$/i.test(t))) {
    imports.add('uuid')
    col = `uuid('${field.name}').defaultRandom().primaryKey()`
  } else if (t === 'uuid' || /^[a-z]+id$/i.test(t)) {
    imports.add('uuid')
    col = `uuid('${field.name}')`
  } else if (t === 'boolean' || t === 'bool') {
    imports.add('boolean')
    col = `boolean('${field.name}')`
  } else if (t === 'int' || t === 'integer') {
    imports.add('integer')
    col = `integer('${field.name}')`
  } else if (t === 'bigint' || t === 'long') {
    imports.add('bigint')
    col = `bigint('${field.name}', { mode: 'number' })`
  } else if (t === 'number' || t === 'float' || t === 'double' || t === 'decimal') {
    imports.add('numeric')
    col = `numeric('${field.name}')`
  } else if (t === 'date') {
    imports.add('date')
    col = `date('${field.name}')`
  } else if (t === 'datetime' || t === 'timestamp') {
    imports.add('timestamp')
    col = `timestamp('${field.name}', { withTimezone: true })`
  } else if (t === 'json' || t === 'object') {
    imports.add('jsonb')
    col = `jsonb('${field.name}')`
  } else if (t.startsWith('enum:')) {
    const values = t.slice(5).split('|').map((v) => v.trim()).filter(Boolean)
    imports.add('text')
    col = `text('${field.name}', { enum: [${values.map((v) => `'${v}'`).join(', ')}] as const })`
  } else {
    imports.add('text')
    col = `text('${field.name}')`
  }

  // Defaults para timestamps gerenciados
  if (field.name === 'createdAt' && (t === 'datetime' || t === 'timestamp')) {
    col += '.defaultNow()'
  }
  if (field.required && field.name !== 'id') col += '.notNull()'

  return { column: col, imports }
}

export function buildDrizzleSchemaFile(design: SystemDesign): string {
  const allImports = new Set<string>(['pgTable'])
  const tableBlocks: string[] = []

  for (const entity of design.dataModel) {
    const lines: string[] = []
    for (const field of entity.fields) {
      const { column, imports } = drizzleColumnForField(field)
      for (const i of imports) allImports.add(i)
      lines.push(`  ${field.name}: ${column},`)
    }
    const tableVar = camelCase(pluralize(entity.entity))
    tableBlocks.push(
      [
        `// ${entity.entity} (${entity.context})`,
        `export const ${tableVar} = pgTable('${entity.tableName}', {`,
        ...lines,
        `})`,
        ``,
        `export type ${pascalCase(entity.entity)}Row = typeof ${tableVar}.$inferSelect`,
        `export type New${pascalCase(entity.entity)} = typeof ${tableVar}.$inferInsert`,
      ].join('\n'),
    )
  }

  return [
    `import { ${[...allImports].sort().join(', ')} } from 'drizzle-orm/pg-core'`,
    ``,
    tableBlocks.join('\n\n'),
    ``,
  ].join('\n')
}

export function buildDrizzleClientFile(): string {
  return [
    `import { drizzle } from 'drizzle-orm/postgres-js'`,
    `import postgres from 'postgres'`,
    `import { env } from '../env'`,
    `import * as schema from './schema'`,
    ``,
    `const client = postgres(env.DATABASE_URL, { max: 10 })`,
    ``,
    `export const db = drizzle(client, { schema })`,
    `export { schema }`,
    ``,
  ].join('\n')
}

// ============================================================================
// Fastify routes + handlers
// ============================================================================

// Normaliza ":id" -> ":id" (Fastify aceita; só remove path params do operationId)
function fastifyPath(routePrefix: string, apiPath: string): string {
  return (routePrefix + apiPath).replace(/\/+/g, '/')
}

function handlerName(method: string, apiPath: string): string {
  const segments = apiPath
    .replace(/:/g, '')
    .split('/')
    .filter(Boolean)
    .map((s) => pascalCase(s))
    .join('')
  return camelCase(method) + segments || camelCase(method)
}

export function buildRoutesFile(bc: SystemDesign['boundedContexts'][number]): string {
  const handlerModule = `../handlers/${kebabCase(bc.name)}.handlers`
  const handlerVar = camelCase(bc.name) + 'Handlers'

  const routes = bc.apis.map((api) => {
    const fnName = handlerName(api.method, api.path)
    const path = fastifyPath(bc.routePrefix, api.path)
    return `  app.${api.method.toLowerCase()}('${path}', ${handlerVar}.${fnName})`
  })

  return [
    `import type { FastifyInstance } from 'fastify'`,
    `import { ${handlerVar} } from '${handlerModule}'`,
    ``,
    `export async function ${camelCase(bc.name)}Routes(app: FastifyInstance): Promise<void> {`,
    ...routes,
    `}`,
    ``,
  ].join('\n')
}

export function buildHandlersFile(bc: SystemDesign['boundedContexts'][number]): string {
  const handlerVar = camelCase(bc.name) + 'Handlers'

  const handlers = bc.apis.map((api) => {
    const fnName = handlerName(api.method, api.path)
    const path = fastifyPath(bc.routePrefix, api.path)
    return [
      `  // ${api.description}`,
      `  async ${fnName}(_req: FastifyRequest, reply: FastifyReply) {`,
      `    return reply.code(501).send({`,
      `      code: 'NOT_IMPLEMENTED',`,
      `      message: 'Endpoint não implementado: ${api.method} ${path}',`,
      `    })`,
      `  },`,
    ].join('\n')
  })

  return [
    `import type { FastifyRequest, FastifyReply } from 'fastify'`,
    ``,
    `export const ${handlerVar} = {`,
    handlers.join('\n\n'),
    `}`,
    ``,
  ].join('\n')
}

export function buildRoutesIndexFile(design: SystemDesign): string {
  const imports = design.boundedContexts.map(
    (bc) => `import { ${camelCase(bc.name)}Routes } from './${kebabCase(bc.name)}.routes'`,
  )
  const registrations = design.boundedContexts.map(
    (bc) => `  await app.register(${camelCase(bc.name)}Routes)`,
  )

  return [
    `import type { FastifyInstance } from 'fastify'`,
    ...imports,
    ``,
    `export async function registerRoutes(app: FastifyInstance): Promise<void> {`,
    ...registrations,
    `}`,
    ``,
  ].join('\n')
}

// ============================================================================
// Server bootstrap (Fastify)
// ============================================================================

export function buildServerFile(design: SystemDesign): string {
  const usesCors = design.nonFunctional.cors
  const lines: string[] = [
    `import Fastify from 'fastify'`,
    `import { env } from './env'`,
    `import { registerRoutes } from './routes'`,
  ]

  if (usesCors) lines.push(`import cors from '@fastify/cors'`)

  lines.push(
    ``,
    `const app = Fastify({`,
    `  logger: env.NODE_ENV === 'production' ? true : { transport: { target: 'pino-pretty' } },`,
    `})`,
    ``,
  )

  if (usesCors) {
    lines.push(`await app.register(cors, { origin: env.CORS_ORIGIN ?? true })`)
  }

  lines.push(
    `await registerRoutes(app)`,
    ``,
    `app.get('/health', async () => ({ status: 'ok' }))`,
    ``,
    `try {`,
    `  await app.listen({ port: env.PORT, host: '0.0.0.0' })`,
    `  app.log.info(\`API ouvindo em http://localhost:\${env.PORT}\`)`,
    `} catch (err) {`,
    `  app.log.error(err)`,
    `  process.exit(1)`,
    `}`,
    ``,
  )

  return lines.join('\n')
}

export function buildEnvFile(design: SystemDesign): string {
  const requiresAuth = design.infrastructure.auth !== 'none'
  const fields: string[] = [
    `  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),`,
    `  PORT: z.coerce.number().int().positive().default(3000),`,
    `  DATABASE_URL: z.string().url(),`,
  ]
  if (design.nonFunctional.cors) {
    fields.push(`  CORS_ORIGIN: z.string().optional(),`)
  }
  if (requiresAuth && design.infrastructure.auth === 'jwt') {
    fields.push(`  JWT_SECRET: z.string().min(32),`)
  }

  return [
    `import { z } from 'zod'`,
    ``,
    `const EnvSchema = z.object({`,
    ...fields,
    `})`,
    ``,
    `const parsed = EnvSchema.safeParse(process.env)`,
    `if (!parsed.success) {`,
    `  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors)`,
    `  process.exit(1)`,
    `}`,
    ``,
    `export const env = parsed.data`,
    ``,
  ].join('\n')
}

// ============================================================================
// Arquivos da raiz do workspace
// ============================================================================

export function buildPackageJson(projectName: string, design: SystemDesign): string {
  const deps: Record<string, string> = {
    'fastify': '^5.0.0',
    'drizzle-orm': '^0.36.0',
    'postgres': '^3.4.0',
    'zod': '^3.23.0',
  }
  if (design.nonFunctional.cors) deps['@fastify/cors'] = '^10.0.0'
  if (design.infrastructure.auth === 'jwt') deps['jsonwebtoken'] = '^9.0.0'

  const devDeps: Record<string, string> = {
    'drizzle-kit': '^0.28.0',
    'pino-pretty': '^11.0.0',
    'typescript': '^5.5.0',
    '@types/node': '^22.0.0',
  }
  if (design.infrastructure.auth === 'jwt') devDeps['@types/jsonwebtoken'] = '^9.0.0'

  const pkg = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'bun run --watch generated/server.ts',
      start: 'bun run generated/server.ts',
      'db:generate': 'drizzle-kit generate',
      'db:migrate': 'drizzle-kit migrate',
      'db:studio': 'drizzle-kit studio',
      typecheck: 'tsc --noEmit',
    },
    dependencies: deps,
    devDependencies: devDeps,
  }

  return JSON.stringify(pkg, null, 2) + '\n'
}

export function buildTsconfig(): string {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      types: ['bun-types'],
    },
    include: ['generated/**/*.ts', 'src/**/*.ts'],
  }
  return JSON.stringify(tsconfig, null, 2) + '\n'
}

export function buildDrizzleConfig(): string {
  return [
    `import { defineConfig } from 'drizzle-kit'`,
    ``,
    `export default defineConfig({`,
    `  schema: './generated/db/schema.ts',`,
    `  out: './generated/db/migrations',`,
    `  dialect: 'postgresql',`,
    `  dbCredentials: { url: process.env.DATABASE_URL! },`,
    `})`,
    ``,
  ].join('\n')
}

export function buildEnvExample(design: SystemDesign): string {
  const lines = [
    `NODE_ENV=development`,
    `PORT=3000`,
    `DATABASE_URL=postgres://user:pass@localhost:5432/${kebabCase(design.boundedContexts[0]?.name ?? 'app')}`,
  ]
  if (design.nonFunctional.cors) lines.push(`# CORS_ORIGIN=https://app.example.com`)
  if (design.infrastructure.auth === 'jwt') lines.push(`JWT_SECRET=change-me-to-a-32-char-or-longer-secret`)
  return lines.join('\n') + '\n'
}

export function buildGitignore(): string {
  return [
    `node_modules/`,
    `bun.lock`,
    `.env`,
    `.env.local`,
    `*.log`,
    `dist/`,
    `.DS_Store`,
    ``,
  ].join('\n')
}

export function buildGeneratedReadme(design: SystemDesign): string {
  const endpoints = design.boundedContexts.reduce((acc, bc) => acc + bc.apis.length, 0)
  return [
    `# generated/`,
    ``,
    `> Esta pasta é gerenciada pelo \`o2 run build\`. **Não edite arquivos aqui.**`,
    ``,
    `Toda re-execução de \`o2 run build\` sobrescreve este diretório a partir de:`,
    `- \`openapi.yaml\` (gerado por \`o2 run contract\`)`,
    `- \`system-design.json\` (gerado por \`o2 run plan\`)`,
    ``,
    `## Conteúdo`,
    ``,
    `- \`server.ts\` — bootstrap do Fastify`,
    `- \`env.ts\` — validação de variáveis de ambiente (Zod)`,
    `- \`routes/\` — registro de rotas por bounded context`,
    `- \`handlers/\` — stubs \`501 Not Implemented\` para cada endpoint`,
    `- \`schemas/\` — schemas Zod por entidade`,
    `- \`db/schema.ts\` — schema Drizzle ORM (PostgreSQL)`,
    `- \`db/client.ts\` — conexão com o banco`,
    ``,
    `## Estatísticas deste contrato`,
    ``,
    `- Bounded contexts: ${design.boundedContexts.length}`,
    `- Endpoints: ${endpoints}`,
    `- Entidades: ${design.dataModel.length}`,
    ``,
    `## Implementando lógica de negócio`,
    ``,
    `Crie sua lógica em \`src/\` (paralelo a \`generated/\`). Importe schemas e o cliente do banco:`,
    ``,
    `\`\`\`ts`,
    `import { db, schema } from '../generated/db/client'`,
    `import { ${pascalCase(design.dataModel[0]?.entity ?? 'Entity')}Schema } from '../generated/schemas'`,
    `\`\`\``,
    ``,
    `Para fazer um handler real, atualize a função no \`generated/handlers/<bc>.handlers.ts\` chamando services em \`src/\`. **Mas lembre-se:** edits diretos em \`generated/handlers/\` serão perdidos no próximo build. Padrão recomendado: handlers em \`generated/\` apenas delegam para services em \`src/services/<bc>.service.ts\`.`,
    ``,
  ].join('\n')
}
