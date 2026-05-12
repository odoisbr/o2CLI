import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { generateEmbeddings } from '../services/embeddings.service'
import type { UsageRepository } from '../repositories/usage.repository'

const EmbeddingsBody = z.object({
  texts: z.array(z.string().min(1)).min(1).max(512),
})

export function makeEmbeddingsController(usageRepo: UsageRepository) {
  return {
    async embed(req: FastifyRequest, reply: FastifyReply) {
      const parsed = EmbeddingsBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ success: false, code: 'INVALID_BODY', message: parsed.error.message })
      }

      let result
      try {
        result = await generateEmbeddings(parsed.data.texts)
      } catch (err) {
        return reply.code(502).send({ success: false, code: 'EMBEDDINGS_FAILED', message: String(err) })
      }

      await usageRepo.create({
        apiKeyId: req.apiKeyId,
        skill: 'o2-ingest',
        projectName: '-',
        provider: 'openai',
        model: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: 0,
        costUsd: result.usage.costUsd,
        durationMs: 0,
        success: true,
      })

      return reply.send({
        embeddings: result.embeddings,
        model: result.model,
        usage: result.usage,
      })
    },
  }
}
