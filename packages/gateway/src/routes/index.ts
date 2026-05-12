import type { FastifyInstance } from 'fastify'
import { skillsRoutes } from './skills.routes'
import type { UsageRepository } from '../repositories/usage.repository'

export async function registerRoutes(server: FastifyInstance, opts: { usageRepo: UsageRepository }) {
  server.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))
  server.register(skillsRoutes, { prefix: '/v1', usageRepo: opts.usageRepo })
}
