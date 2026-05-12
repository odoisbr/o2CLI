import { z } from 'zod'

// --- o2-ingest ---

export const DomainSummarySchema = z.object({
  executiveSummary: z.string().describe('Visão geral do domínio em 2-3 parágrafos'),
  entities: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      attributes: z.array(z.string()),
    })
  ).describe('Entidades principais do domínio'),
  boundedContexts: z.array(
    z.object({
      name: z.string(),
      responsibilities: z.array(z.string()),
    })
  ).describe('Bounded contexts identificados'),
  useCases: z.array(z.string()).describe('Casos de uso principais'),
  ubiquitousLanguage: z.array(
    z.object({
      term: z.string(),
      definition: z.string(),
    })
  ).describe('Glossário de termos do domínio'),
})

export type DomainSummary = z.infer<typeof DomainSummarySchema>
