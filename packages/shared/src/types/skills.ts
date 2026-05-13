import { z } from 'zod'

// --- o2-ingest ---

export const DomainSummarySchema = z.object({
  executiveSummary: z.string().describe('Visão geral do domínio em 2-3 parágrafos'),
  entities: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      attributes: z.array(z.string()),
    })
  ).describe('Entidades principais do domínio'),
  boundedContexts: z.array(
    z.object({
      name: z.string(),
      responsibilities: z.array(z.string()),
    })
  ).describe('Bounded contexts identificados'),
  useCases: z.array(z.string()).describe('Casos de uso principais'),
  ubiquitousLanguage: z.array(
    z.object({
      term: z.string(),
      definition: z.string(),
    })
  ).describe('Glossário de termos do domínio'),
})

export type DomainSummary = z.infer<typeof DomainSummarySchema>

// --- o2-plan ---

export const ApiEndpointSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().describe('Caminho relativo ao contexto, ex: /users/:id'),
  description: z.string(),
  requiresAuth: z.boolean(),
  hasRequestBody: z.boolean(),
  queryParams: z.array(z.string()).describe('Nomes dos query params opcionais'),
})

export const DataFieldSchema = z.object({
  name: z.string(),
  type: z.string().describe('Tipo primitivo ou referência, ex: string, number, UserId'),
  required: z.boolean(),
  description: z.string(),
})

export const RelationSchema = z.object({
  entity: z.string(),
  type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
  through: z.string().optional().describe('Tabela pivot para many-to-many'),
})

export const SystemDesignSchema = z.object({
  overview: z.string().describe('Visão geral da arquitetura em 2-3 parágrafos'),

  boundedContexts: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      routePrefix: z.string().describe('Prefixo base das rotas, ex: /users'),
      entities: z.array(z.string()).describe('Entidades que pertencem a este contexto'),
      apis: z.array(ApiEndpointSchema),
    })
  ).describe('Contextos delimitados com suas responsabilidades e APIs'),

  dataModel: z.array(
    z.object({
      entity: z.string(),
      context: z.string().describe('Nome do bounded context dono desta entidade'),
      tableName: z.string().describe('Nome da tabela no banco, ex: users'),
      fields: z.array(DataFieldSchema),
      relations: z.array(RelationSchema),
    })
  ).describe('Modelo de dados completo'),

  infrastructure: z.object({
    database: z.string().describe('Ex: PostgreSQL, MySQL, SQLite'),
    cache: z.boolean().describe('Requer Redis ou similar'),
    queue: z.boolean().describe('Requer fila assíncrona (BullMQ, SQS...)'),
    fileStorage: z.boolean().describe('Requer armazenamento de arquivos'),
    auth: z.enum(['jwt', 'session', 'oauth2', 'api-key', 'none']),
  }),

  nonFunctional: z.object({
    rateLimit: z.boolean(),
    pagination: z.boolean().describe('Endpoints de listagem precisam de paginação'),
    softDelete: z.boolean().describe('Entidades usam soft delete'),
    observability: z.boolean().describe('Requer logs estruturados + métricas'),
    cors: z.boolean(),
  }),
})

export type SystemDesign = z.infer<typeof SystemDesignSchema>
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>
export type DataField = z.infer<typeof DataFieldSchema>
