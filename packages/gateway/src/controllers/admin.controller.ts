import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { KeysService } from '../services/keys.service'

const CreateKeyBody = z.object({
  name: z.string().min(1).max(64),
  quotaUsd: z.number().positive().optional(),
})

export function makeAdminController(keysService: KeysService) {
  return {
    async createKey(req: FastifyRequest, reply: FastifyReply) {
      const parsed = CreateKeyBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ success: false, code: 'INVALID_BODY', message: parsed.error.message })
      }

      const created = await keysService.create(parsed.data)

      return reply.code(201).send({
        id: created.id,
        name: created.name,
        key: created.key,
        quotaUsd: created.quotaUsd,
        createdAt: created.createdAt,
        // key só aparece aqui — não há endpoint para recuperá-la depois
        _note: 'Salve esta chave agora. Ela não será exibida novamente.',
      })
    },

    async listKeys(req: FastifyRequest, reply: FastifyReply) {
      const keys = await keysService.list()
      return reply.send({ keys })
    },

    async revokeKey(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const found = await keysService.revoke(req.params.id)

      if (!found) {
        return reply.code(404).send({ success: false, code: 'KEY_NOT_FOUND', message: 'Chave não encontrada' })
      }

      return reply.code(204).send()
    },
  }
}
