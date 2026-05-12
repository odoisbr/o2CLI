import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { randomBytes } from 'crypto'

export const adminAuthPlugin = fp(async function (server: FastifyInstance) {
  let adminSecret = process.env.ADMIN_SECRET

  if (!adminSecret) {
    // Em desenvolvimento, gera e loga — em produção deve ser obrigatório
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_SECRET obrigatório em produção')
    }
    adminSecret = `o2_admin_${randomBytes(16).toString('hex')}`
    server.log.warn({ adminSecret }, '⚠️  ADMIN_SECRET não definido — gerado para esta sessão')
  }

  server.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/v1/admin')) return

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, code: 'MISSING_ADMIN_TOKEN', message: 'Admin Bearer token obrigatório' })
    }

    if (authHeader.slice(7) !== adminSecret) {
      return reply.code(403).send({ success: false, code: 'INVALID_ADMIN_TOKEN', message: 'Token de admin inválido' })
    }
  })
})
