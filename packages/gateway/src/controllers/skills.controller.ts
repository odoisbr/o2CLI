import type { FastifyRequest, FastifyReply } from 'fastify'
import { SkillPayloadSchema } from '@o2/shared'
import { executeLLM } from '../services/llm.service'
import type { UsageRepository } from '../repositories/usage.repository'

// Injetado via decorador do Fastify
declare module 'fastify' {
  interface FastifyRequest {
    apiKeyId: string
    apiKeyName: string
    apiKeyQuotaUsd: number | null
  }
}

export function makeSkillsController(usageRepo: UsageRepository) {
  return {
    async execute(req: FastifyRequest, reply: FastifyReply) {
      const parsed = SkillPayloadSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          code: 'INVALID_PAYLOAD',
          message: parsed.error.message,
        })
      }

      const payload = parsed.data

      // Verifica quota mensal se configurada
      if (req.apiKeyQuotaUsd != null) {
        const { totalCostUsd } = await usageRepo.getMonthlyTotal(req.apiKeyId)
        if (totalCostUsd >= req.apiKeyQuotaUsd) {
          return reply.code(429).send({
            success: false,
            code: 'QUOTA_EXCEEDED',
            message: `Quota mensal de $${req.apiKeyQuotaUsd} atingida ($${totalCostUsd.toFixed(4)} consumidos)`,
            skill: payload.skill,
          })
        }
      }

      // Placheholder de prompt — cada skill terá seu próprio builder
      const prompt = `Skill: ${payload.skill}\nProject: ${payload.projectName}\nInputs: ${JSON.stringify(payload.inputs)}`

      let result
      try {
        result = await executeLLM({
          provider: 'anthropic', // virá do o2.config.json no payload futuro
          model: 'claude-sonnet-4-6',
          system: 'Você é o motor de geração de software o2. Siga rigorosamente o contrato OpenAPI.',
          prompt,
        })
      } catch (err) {
        return reply.code(502).send({
          success: false,
          code: 'LLM_UNAVAILABLE',
          message: String(err),
          skill: payload.skill,
        })
      }

      await usageRepo.create({
        apiKeyId: req.apiKeyId,
        skill: payload.skill,
        projectName: payload.projectName,
        provider: result.provider,
        model: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costUsd: result.usage.costUsd,
        durationMs: result.durationMs,
        success: true,
      })

      return reply.send({
        success: true,
        skill: payload.skill,
        outputs: { text: result.text },
        usage: result.usage,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
      })
    },
  }
}
