import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import { registerRoutes } from './routes'
import { authPlugin } from './plugins/auth.plugin'
import { makeAuthService } from './services/auth.service'
import { makeUsageRepository } from './repositories/usage.repository'

const db = new PrismaClient()
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

// Expõe serviços via decoradores antes dos plugins dependentes
server.decorate('authService', makeAuthService(db, redis))

const usageRepo = makeUsageRepository(db)

server.register(cors, { origin: false })
server.register(rateLimit, { max: 120, timeWindow: '1 minute', redis })
server.register(authPlugin)
server.register(registerRoutes, { usageRepo })

server.addHook('onClose', async () => {
  await db.$disconnect()
  redis.disconnect()
})

const PORT = Number(process.env.PORT ?? 3000)

server.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    server.log.error(err)
    process.exit(1)
  }
})
