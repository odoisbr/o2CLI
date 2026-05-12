import type { FastifyInstance } from 'fastify'
import type { KeysService } from '../services/keys.service'
import { makeAdminController } from '../controllers/admin.controller'

export async function adminRoutes(server: FastifyInstance, opts: { keysService: KeysService }) {
  const controller = makeAdminController(opts.keysService)

  server.post('/admin/keys', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          quotaUsd: { type: 'number' },
        },
      },
    },
  }, controller.createKey)

  server.get('/admin/keys', controller.listKeys)

  server.delete('/admin/keys/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, controller.revokeKey)
}
