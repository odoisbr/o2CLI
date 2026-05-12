import type { FastifyRequest, FastifyReply } from 'fastify'
import { SkillPayloadSchema } from '@o2/shared'
import { executeLLM } from '../services/llm.service'
import { handleIngest } from '../services/skills/o2-ingest.handler'
import type { UsageRepository } from '../repositories/usage.repository'

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

      // Roteador de skills — cada skill tem seu handler especializado
      try {
        if (payload.skill === 'o2-ingest') {
          const inputs = payload.inputs as { documents: Array<{ filename: string; content: string }>; model?: string }
          const result = await handleIngest(inputs)

          await usageRepo.create({
            apiKeyId: req.apiKeyId,
            skill: payload.skill,
            projectName: payload.projectName,
            provider: 'anthropic',
            model: inputs.model ?? 'claude-sonnet-4-6',
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            costUsd: 0, // calculado no handler futuramente
            durationMs: result.durationMs,
            success: true,
          })

          return reply.send({
            success: true,
            skill: payload.skill,
            outputs: result.summary,
            usage: { ...result.usage, costUsd: 0 },
            provider: 'anthropic',
            model: inputs.model ?? 'claude-sonnet-4-6',
            durationMs: result.durationMs,
          })
        }

        // Fallback genérico para skills ainda não implementadas
        const prompt = `Skill: ${payload.skill}\nProject: ${payload.projectName}\nInputs: ${JSON.stringify(payload.inputs)}`
        const result = await executeLLM({
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
          system: 'Você é o motor de geração de software o2. Siga rigorosamente o contrato OpenAPI.',
          prompt,
        })

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
      } catch (err) {
        return reply.code(502).send({
          success: false,
          code: 'SKILL_FAILED',
          message: String(err),
          skill: payload.skill,
        })
      }
    },
  }
}
