#!/usr/bin/env bun
import * as p from '@clack/prompts'
import { Command } from 'commander'
import { onboard } from './commands/onboard'
import { createNew } from './commands/new'
import { engineExists, readEngine, readO2Config } from './utils/config'
import { WWW_DIR, MEMORY_DIR } from './utils/fs'
import { join } from 'path'
import { o2IngestSkill } from './skills/o2-ingest'
import { o2PlanSkill } from './skills/o2-plan'

const program = new Command()

program
  .name('o2')
  .description('CLI para orquestração de geração de software production-ready')
  .version('0.0.1')

program
  .command('onboard')
  .description('Configura o motor o2 na máquina (executar uma única vez)')
  .action(onboard)

program
  .command('new')
  .description('Cria um novo projeto gerenciado pelo o2')
  .action(createNew)

// --- Pipeline de skills ---
const runCmd = program
  .command('run')
  .description('Executa uma skill do pipeline o2')

runCmd
  .command('ingest')
  .description('Vetoriza regras de negócio do domínio local')
  .requiredOption('-p, --project <name>', 'Nome do projeto')
  .action(async (opts: { project: string }) => {
    p.intro(`o2 run ingest — ${opts.project}`)

    if (!engineExists()) {
      p.cancel('Motor não configurado. Execute `o2 onboard` primeiro.')
      process.exit(1)
    }

    const engine = readEngine()
    const workspacePath = join(WWW_DIR, opts.project)
    const memoryPath = join(MEMORY_DIR, opts.project)

    let config
    try {
      config = readO2Config(workspacePath)
    } catch {
      p.cancel(`Projeto "${opts.project}" não encontrado. Execute \`o2 new\` primeiro.`)
      process.exit(1)
    }

    const s = p.spinner()

    try {
      s.start('Ingerindo domínio')
      const result = await o2IngestSkill.execute(
        { config, engine, workspacePath, memoryPath },
        { projectName: opts.project, memoryPath },
      )
      s.stop(`${result.chunksStored} chunks vetorizados`)

      p.note(
        [
          `Bounded contexts: ${result.summary.boundedContexts.length}`,
          `Entidades: ${result.summary.entities.length}`,
          `Casos de uso: ${result.summary.useCases.length}`,
          `Sumário salvo em: ${result.summaryPath}`,
        ].join('\n'),
        'Domínio ingerido'
      )

      p.outro('Próximo passo: o2 run plan --project ' + opts.project)
    } catch (err) {
      s.stop('Erro durante a ingestão')
      p.cancel(String(err))
      process.exit(1)
    }
  })

runCmd
  .command('plan')
  .description('Gera o system design a partir dos vetores de domínio')
  .requiredOption('-p, --project <name>', 'Nome do projeto')
  .option('--force', 'Re-gera mesmo que o lock esteja válido')
  .action(async (opts: { project: string; force?: boolean }) => {
    p.intro(`o2 run plan — ${opts.project}`)

    if (!engineExists()) {
      p.cancel('Motor não configurado. Execute `o2 onboard` primeiro.')
      process.exit(1)
    }

    const engine = readEngine()
    const workspacePath = join(WWW_DIR, opts.project)
    const memoryPath = join(MEMORY_DIR, opts.project)

    let config
    try {
      config = readO2Config(workspacePath)
    } catch {
      p.cancel(`Projeto "${opts.project}" não encontrado. Execute \`o2 new\` primeiro.`)
      process.exit(1)
    }

    const s = p.spinner()

    try {
      s.start('Gerando system design')
      const result = await o2PlanSkill.execute(
        { config, engine, workspacePath, memoryPath },
        { projectName: opts.project, memoryPath, workspacePath, force: opts.force },
      )

      if (result.skipped) {
        s.stop('System design já atualizado (lock válido). Use --force para re-gerar.')
      } else {
        s.stop('System design gerado')
        p.note(
          [
            `Bounded contexts: ${result.design.boundedContexts.length}`,
            `Entidades: ${result.design.dataModel.length}`,
            `Total de endpoints: ${result.design.boundedContexts.reduce((acc, bc) => acc + bc.apis.length, 0)}`,
            `Auth: ${result.design.infrastructure.auth}`,
            `Salvo em: ${result.designMdPath}`,
          ].join('\n'),
          'System Design'
        )
      }

      p.outro('Próximo passo: o2 run contract --project ' + opts.project)
    } catch (err) {
      s.stop('Erro durante o planejamento')
      p.cancel(String(err))
      process.exit(1)
    }
  })

runCmd
  .command('contract')
  .description('Gera o openapi.yaml a partir do system design')
  .requiredOption('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-contract — em implementação') })

runCmd
  .command('build')
  .description('Implementa o código a partir do contrato OpenAPI')
  .requiredOption('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-build — em implementação') })

runCmd
  .command('infra')
  .description('Containeriza e configura observabilidade')
  .requiredOption('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-infra — em implementação') })

runCmd
  .command('docs')
  .description('Gera documentação de integração DX')
  .requiredOption('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-docs — em implementação') })

runCmd
  .command('audit')
  .description('Revisa código contra OpenAPI e system design')
  .requiredOption('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-audit — em implementação') })

program.parse()
