import type { FastifyInstance } from 'fastify'
import { skillsRoutes } from './skills.routes'
import { adminRoutes } from './admin.routes'
import { embeddingsRoutes } from './embeddings.routes'
import type { UsageRepository } from '../repositories/usage.repository'
import type { KeysService } from '../services/keys.service'

interface RouteOpts {
  usageRepo: UsageRepository
  keysService: KeysService
}

export async function registerRoutes(server: FastifyInstance, opts: RouteOpts) {
  server.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))
  server.register(skillsRoutes, { prefix: '/v1', usageRepo: opts.usageRepo })
  server.register(embeddingsRoutes, { prefix: '/v1', usageRepo: opts.usageRepo })
  server.register(adminRoutes, { prefix: '/v1', keysService: opts.keysService })
}
