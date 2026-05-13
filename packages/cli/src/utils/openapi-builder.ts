import type { SystemDesign, ApiEndpoint, DataField } from '@o2/shared'

// Mapeia um SystemDesign para um objeto OpenAPI 3.1 puro.
// Determinístico: mesma entrada -> mesma saída. Sem LLM.

interface OpenAPISpec {
  openapi: '3.1.0'
  info: { title: string; version: string; description: string }
  servers: Array<{ url: string; description: string }>
  security?: Array<Record<string, string[]>>
  tags: Array<{ name: string; description: string }>
  paths: Record<string, Record<string, unknown>>
  components: {
    securitySchemes?: Record<string, unknown>
    schemas: Record<string, unknown>
  }
}

const DEFAULT_VERSION = '0.1.0'
const DEFAULT_SERVER = 'http://localhost:3000'

// Heurística simples — string declarada no DataField.type vira OpenAPI schema.
function mapFieldType(type: string): Record<string, unknown> {
  const t = type.trim().toLowerCase()

  if (t.startsWith('enum:')) {
    const values = t.slice(5).split('|').map((v) => v.trim()).filter(Boolean)
    return { type: 'string', enum: values }
  }

  if (t === 'uuid' || /^[a-z]+id$/i.test(t)) return { type: 'string', format: 'uuid' }
  if (t === 'email') return { type: 'string', format: 'email' }
  if (t === 'url' || t === 'uri') return { type: 'string', format: 'uri' }
  if (t === 'date') return { type: 'string', format: 'date' }
  if (t === 'datetime' || t === 'timestamp') return { type: 'string', format: 'date-time' }
  if (t === 'boolean' || t === 'bool') return { type: 'boolean' }
  if (t === 'int' || t === 'integer') return { type: 'integer', format: 'int32' }
  if (t === 'bigint' || t === 'long') return { type: 'integer', format: 'int64' }
  if (t === 'number' || t === 'float' || t === 'double' || t === 'decimal') return { type: 'number' }
  if (t === 'json' || t === 'object') return { type: 'object', additionalProperties: true }
  if (t === 'text' || t === 'string') return { type: 'string' }

  // Tipo customizado capitalizado vira referência a outro schema
  if (/^[A-Z]/.test(type)) return { $ref: `#/components/schemas/${type}` }

  return { type: 'string' }
}

function pascalCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

function camelCase(input: string): string {
  const pascal = pascalCase(input)
  return pascal[0]?.toLowerCase() + pascal.slice(1)
}

// Converte ":id" e ":userId" do estilo Express para "{id}" e "{userId}" do OpenAPI.
function normalizePath(path: string): { path: string; params: string[] } {
  const params: string[] = []
  const normalized = path.replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g, (_, name) => {
    params.push(name)
    return `{${name}}`
  })
  return { path: normalized, params }
}

function buildEntitySchema(
  entity: SystemDesign['dataModel'][number],
  variant: 'full' | 'input',
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  // Variant 'input' omite campos gerenciados pelo servidor
  const isManagedField = (name: string) =>
    name === 'id' || name === 'createdAt' || name === 'updatedAt' || name === 'deletedAt'

  for (const field of entity.fields) {
    if (variant === 'input' && isManagedField(field.name)) continue

    const schema = mapFieldType(field.type)
    properties[field.name] = { ...schema, description: field.description }

    if (field.required && !isManagedField(field.name)) {
      required.push(field.name)
    }
  }

  // Relações como referências (apenas no schema 'full' — input não carrega relações expandidas)
  if (variant === 'full') {
    for (const rel of entity.relations) {
      if (rel.type === 'one-to-many' || rel.type === 'many-to-many') {
        properties[camelCase(rel.entity) + 's'] = {
          type: 'array',
          items: { $ref: `#/components/schemas/${rel.entity}` },
        }
      } else {
        properties[camelCase(rel.entity)] = { $ref: `#/components/schemas/${rel.entity}` }
      }
    }
  }

  const schema: Record<string, unknown> = {
    type: 'object',
    properties,
  }
  if (required.length > 0) schema.required = required

  return schema
}

function buildOperationId(bcName: string, method: string, path: string): string {
  const parts = path
    .replace(/[{}]/g, '')
    .split('/')
    .filter(Boolean)
    .map((p) => pascalCase(p))
    .join('')
  return camelCase(bcName) + pascalCase(method.toLowerCase()) + parts
}

function buildPathItem(
  bc: SystemDesign['boundedContexts'][number],
  api: ApiEndpoint,
  defaultEntity: string | undefined,
  hasAuth: boolean,
  hasPagination: boolean,
): { fullPath: string; operation: Record<string, unknown> } {
  const fullRaw = bc.routePrefix + api.path
  const { path: fullPath, params } = normalizePath(fullRaw)

  const parameters: Array<Record<string, unknown>> = []

  for (const p of params) {
    parameters.push({
      name: p,
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
      description: `Identificador de ${p}`,
    })
  }

  for (const q of api.queryParams) {
    parameters.push({
      name: q,
      in: 'query',
      required: false,
      schema: { type: 'string' },
    })
  }

  // Endpoints GET de listagem (sem path param) ganham paginação se habilitada
  const isListEndpoint =
    api.method === 'GET' && params.length === 0 && hasPagination
  if (isListEndpoint) {
    parameters.push(
      { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    )
  }

  const operation: Record<string, unknown> = {
    tags: [bc.name],
    summary: api.description,
    operationId: buildOperationId(bc.name, api.method, api.path),
  }

  if (parameters.length > 0) operation.parameters = parameters

  if (api.hasRequestBody && defaultEntity) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${defaultEntity}Input` },
        },
      },
    }
  }

  // Resposta de sucesso baseada no método
  const successResponse: Record<string, unknown> = (() => {
    if (!defaultEntity) {
      return {
        description: 'Operação bem-sucedida',
        content: { 'application/json': { schema: { type: 'object' } } },
      }
    }
    if (api.method === 'DELETE') {
      return { description: 'Recurso removido' }
    }
    if (isListEndpoint) {
      return {
        description: 'Lista paginada',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['data', 'page', 'pageSize', 'total'],
              properties: {
                data: { type: 'array', items: { $ref: `#/components/schemas/${defaultEntity}` } },
                page: { type: 'integer' },
                pageSize: { type: 'integer' },
                total: { type: 'integer' },
              },
            },
          },
        },
      }
    }
    return {
      description: 'Recurso retornado',
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${defaultEntity}` },
        },
      },
    }
  })()

  const successCode = api.method === 'POST' ? '201' : api.method === 'DELETE' ? '204' : '200'

  operation.responses = {
    [successCode]: successResponse,
    '400': { $ref: '#/components/responses/BadRequest' },
    ...(hasAuth && api.requiresAuth
      ? {
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        }
      : {}),
    '404': { $ref: '#/components/responses/NotFound' },
    '500': { $ref: '#/components/responses/ServerError' },
  }

  // Endpoints públicos em sistema com auth: override de security vazio
  if (hasAuth && !api.requiresAuth) {
    operation.security = []
  }

  return { fullPath, operation }
}

function buildSecuritySchemes(authType: SystemDesign['infrastructure']['auth']): {
  schemes: Record<string, unknown>
  defaultSecurity: Array<Record<string, string[]>>
} {
  switch (authType) {
    case 'jwt':
      return {
        schemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        defaultSecurity: [{ bearerAuth: [] }],
      }
    case 'session':
      return {
        schemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'session' } },
        defaultSecurity: [{ cookieAuth: [] }],
      }
    case 'oauth2':
      return {
        schemes: {
          oauth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: '/oauth/authorize',
                tokenUrl: '/oauth/token',
                scopes: {},
              },
            },
          },
        },
        defaultSecurity: [{ oauth2: [] }],
      }
    case 'api-key':
      return {
        schemes: { apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' } },
        defaultSecurity: [{ apiKeyAuth: [] }],
      }
    case 'none':
    default:
      return { schemes: {}, defaultSecurity: [] }
  }
}

function buildErrorResponses(): Record<string, unknown> {
  const errorSchema = { $ref: '#/components/schemas/Error' }
  const make = (description: string) => ({
    description,
    content: { 'application/json': { schema: errorSchema } },
  })
  return {
    BadRequest: make('Requisição inválida'),
    Unauthorized: make('Não autenticado'),
    Forbidden: make('Sem permissão'),
    NotFound: make('Recurso não encontrado'),
    ServerError: make('Erro interno do servidor'),
  }
}

export function buildOpenAPISpec(design: SystemDesign, projectName: string): OpenAPISpec {
  const hasAuth = design.infrastructure.auth !== 'none'
  const hasPagination = design.nonFunctional.pagination
  const { schemes, defaultSecurity } = buildSecuritySchemes(design.infrastructure.auth)

  // Schemas — cada entidade gera Entity e EntityInput
  const schemas: Record<string, unknown> = {
    Error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', description: 'Código de erro estável' },
        message: { type: 'string', description: 'Mensagem legível' },
        details: { type: 'object', additionalProperties: true, description: 'Detalhes adicionais' },
      },
    },
  }

  for (const entity of design.dataModel) {
    schemas[entity.entity] = buildEntitySchema(entity, 'full')
    schemas[`${entity.entity}Input`] = buildEntitySchema(entity, 'input')
  }

  // Paths
  const paths: Record<string, Record<string, unknown>> = {}
  for (const bc of design.boundedContexts) {
    // Heurística: entidade default do contexto = primeira da lista declarada
    const defaultEntity = bc.entities[0]

    for (const api of bc.apis) {
      const { fullPath, operation } = buildPathItem(bc, api, defaultEntity, hasAuth, hasPagination)
      if (!paths[fullPath]) paths[fullPath] = {}
      paths[fullPath][api.method.toLowerCase()] = operation
    }
  }

  const spec: OpenAPISpec = {
    openapi: '3.1.0',
    info: {
      title: projectName,
      version: DEFAULT_VERSION,
      description: design.overview,
    },
    servers: [{ url: DEFAULT_SERVER, description: 'Development' }],
    tags: design.boundedContexts.map((bc) => ({ name: bc.name, description: bc.description })),
    paths,
    components: {
      schemas,
      ...(Object.keys(schemes).length > 0 ? { securitySchemes: schemes } : {}),
    },
  }

  // Responses reutilizáveis ficam em components.responses (TS workaround via cast)
  ;(spec.components as Record<string, unknown>).responses = buildErrorResponses()

  if (defaultSecurity.length > 0) spec.security = defaultSecurity

  return spec
}
