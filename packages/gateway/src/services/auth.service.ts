import type { PrismaClient } from '@prisma/client'
import type { Redis } from 'ioredis'

const CACHE_TTL = 60 // segundos

export function makeAuthService(db: PrismaClient, redis: Redis) {
  return {
    async validate(rawKey: string): Promise<{ id: string; name: string; quotaUsd: number | null } | null> {
      const cacheKey = `apikey:${rawKey}`
      const cached = await redis.get(cacheKey)

      if (cached === 'invalid') return null
      if (cached) return JSON.parse(cached) as { id: string; name: string; quotaUsd: number | null }

      const record = await db.apiKey.findUnique({
        where: { key: rawKey, active: true },
        select: { id: true, name: true, quotaUsd: true },
      })

      if (!record) {
        await redis.setex(cacheKey, CACHE_TTL, 'invalid')
        return null
      }

      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(record))
      return record
    },

    async revoke(apiKeyId: string): Promise<void> {
      const record = await db.apiKey.findUnique({ where: { id: apiKeyId }, select: { key: true } })
      await db.apiKey.update({ where: { id: apiKeyId }, data: { active: false } })
      if (record) await redis.del(`apikey:${record.key}`)
    },
  }
}

export type AuthService = ReturnType<typeof makeAuthService>
