import type { PrismaClient } from '@prisma/client'
import type { SkillName } from '@o2/shared'

export interface CreateUsageInput {
  apiKeyId: string
  skill: SkillName
  projectName: string
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  durationMs: number
  success: boolean
}

export interface MonthlyQuotaSummary {
  totalCostUsd: number
  requestCount: number
}

export function makeUsageRepository(db: PrismaClient) {
  return {
    async create(input: CreateUsageInput) {
      return db.usage.create({ data: input })
    },

    async getMonthlyTotal(apiKeyId: string): Promise<MonthlyQuotaSummary> {
      const start = new Date()
      start.setDate(1)
      start.setHours(0, 0, 0, 0)

      const result = await db.usage.aggregate({
        where: { apiKeyId, createdAt: { gte: start } },
        _sum: { costUsd: true },
        _count: { id: true },
      })

      return {
        totalCostUsd: result._sum.costUsd ?? 0,
        requestCount: result._count.id,
      }
    },
  }
}

export type UsageRepository = ReturnType<typeof makeUsageRepository>
