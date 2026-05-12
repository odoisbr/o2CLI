import type { FastifyInstance } from 'fastify'
import type { UsageRepository } from '../repositories/usage.repository'
import { makeEmbeddingsController } from '../controllers/embeddings.controller'

export async function embeddingsRoutes(server: FastifyInstance, opts: { usageRepo: UsageRepository }) {
  const controller = makeEmbeddingsController(opts.usageRepo)

  server.post('/embeddings', {
    schema: {
      body: {
        type: 'object',
        required: ['texts'],
        properties: {
          texts: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 512 },
        },
      },
    },
  }, controller.embed)
}
