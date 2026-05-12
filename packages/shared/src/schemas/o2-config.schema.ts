import { z } from 'zod'

export const O2ConfigSchema = z.object({
  version: z.string(),
  project: z.object({
    name: z.string().min(1),
    mode: z.enum(['hybrid', 'api', 'compiler']),
    createdAt: z.string().datetime(),
  }),
  stack: z.object({
    runtime: z.string(),
    framework: z.string(),
    orm: z.string().optional(),
    database: z.string().optional(),
  }),
  paths: z.object({
    workspace: z.string(),
    memory: z.string(),
  }),
  agent: z.object({
    provider: z.enum(['anthropic', 'openai', 'vertex']),
    model: z.string(),
    quotaUsd: z.number().positive().optional(),
  }),
})

export const SkillPayloadSchema = z.object({
  skill: z.enum(['o2-ingest', 'o2-plan', 'o2-contract', 'o2-build', 'o2-infra', 'o2-docs', 'o2-audit']),
  projectName: z.string().min(1),
  inputs: z.record(z.unknown()),
  lockHash: z.string().optional(),
})

export type O2ConfigInput = z.input<typeof O2ConfigSchema>
