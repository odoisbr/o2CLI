import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { AuthService } from '../services/auth.service'

declare module 'fastify' {
  interface FastifyInstance {
    authService: AuthService
  }
}

export const authPlugin = fp(async function (server: FastifyInstance) {
  server.addHook('onRequest', async (req, reply) => {
    // Rotas públicas não precisam de auth
    if (req.url === '/health') return

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, code: 'MISSING_TOKEN', message: 'Bearer token obrigatório' })
    }

    const token = authHeader.slice(7)
    const keyRecord = await server.authService.validate(token)

    if (!keyRecord) {
      return reply.code(401).send({ success: false, code: 'INVALID_TOKEN', message: 'Token inválido ou revogado' })
    }

    req.apiKeyId = keyRecord.id
    req.apiKeyName = keyRecord.name
    req.apiKeyQuotaUsd = keyRecord.quotaUsd
  })
})
