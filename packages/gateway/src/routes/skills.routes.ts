import type { FastifyInstance } from 'fastify'
import type { UsageRepository } from '../repositories/usage.repository'
import { makeSkillsController } from '../controllers/skills.controller'

export async function skillsRoutes(server: FastifyInstance, opts: { usageRepo: UsageRepository }) {
  const controller = makeSkillsController(opts.usageRepo)

  server.post('/skills/execute', {
    schema: {
      body: {
        type: 'object',
        required: ['skill', 'projectName', 'inputs'],
        properties: {
          skill: { type: 'string' },
          projectName: { type: 'string' },
          inputs: { type: 'object' },
          lockHash: { type: 'string' },
        },
      },
    },
  }, controller.execute)
}
