import { randomBytes } from 'crypto'
import type { KeysRepository } from '../repositories/keys.repository'
import type { UsageRepository } from '../repositories/usage.repository'

export interface CreateKeyOptions {
  name: string
  quotaUsd?: number
}

export interface KeyWithUsage {
  id: string
  name: string
  active: boolean
  quotaUsd: number | null
  createdAt: Date
  usage: {
    currentMonthCostUsd: number
    currentMonthRequests: number
  }
}

export interface CreatedKey extends KeyWithUsage {
  key: string // retornado apenas na criação
}

function generateKey(): string {
  return `o2_sk_${randomBytes(32).toString('hex')}`
}

export function makeKeysService(keysRepo: KeysRepository, usageRepo: UsageRepository) {
  return {
    async create(opts: CreateKeyOptions): Promise<CreatedKey> {
      const key = generateKey()
      const record = await keysRepo.create({ key, name: opts.name, quotaUsd: opts.quotaUsd })
      return {
        key,
        id: record.id,
        name: record.name,
        active: record.active,
        quotaUsd: record.quotaUsd,
        createdAt: record.createdAt,
        usage: { currentMonthCostUsd: 0, currentMonthRequests: 0 },
      }
    },

    async list(): Promise<KeyWithUsage[]> {
      const records = await keysRepo.findAll()

      return Promise.all(
        records.map(async (r) => {
          const usage = await usageRepo.getMonthlyTotal(r.id)
          return {
            id: r.id,
            name: r.name,
            active: r.active,
            quotaUsd: r.quotaUsd,
            createdAt: r.createdAt,
            usage: {
              currentMonthCostUsd: usage.totalCostUsd,
              currentMonthRequests: usage.requestCount,
            },
          }
        }),
      )
    },

    async revoke(id: string): Promise<boolean> {
      const record = await keysRepo.findById(id)
      if (!record) return false
      await keysRepo.revoke(id)
      return true
    },
  }
}

export type KeysService = ReturnType<typeof makeKeysService>
