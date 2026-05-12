import { z } from 'zod'

export const EngineConfigSchema = z.object({
  version: z.string(),
  gatewayUrl: z.string().url(),
  apiKey: z.string().min(1),
  defaultInterface: z.enum(['claude-code', 'cursor', 'cline', 'clipboard']),
  createdAt: z.string().datetime(),
})

export type EngineConfigInput = z.input<typeof EngineConfigSchema>
