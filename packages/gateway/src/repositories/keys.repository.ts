import type { PrismaClient } from '@prisma/client'

export interface CreateKeyInput {
  key: string
  name: string
  quotaUsd?: number
}

export interface KeyRecord {
  id: string
  key: string
  name: string
  active: boolean
  quotaUsd: number | null
  createdAt: Date
}

export function makeKeysRepository(db: PrismaClient) {
  return {
    async create(input: CreateKeyInput): Promise<KeyRecord> {
      return db.apiKey.create({
        data: {
          key: input.key,
          name: input.name,
          quotaUsd: input.quotaUsd ?? null,
        },
      })
    },

    async findAll(): Promise<KeyRecord[]> {
      return db.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
      })
    },

    async findById(id: string): Promise<KeyRecord | null> {
      return db.apiKey.findUnique({ where: { id } })
    },

    async revoke(id: string): Promise<void> {
      await db.apiKey.update({ where: { id }, data: { active: false } })
    },
  }
}

export type KeysRepository = ReturnType<typeof makeKeysRepository>
