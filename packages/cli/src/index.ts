#!/usr/bin/env bun
import { Command } from 'commander'
import { onboard } from './commands/onboard'
import { createNew } from './commands/new'

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

// Skills como subcomandos — serão adicionadas conforme implementadas
const skillCommand = program
  .command('run')
  .description('Executa uma skill do pipeline o2')

skillCommand
  .command('ingest')
  .description('Vetoriza regras de negócio do domínio local')
  .option('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-ingest — em implementação') })

skillCommand
  .command('plan')
  .description('Gera o system design a partir dos vetores de domínio')
  .option('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-plan — em implementação') })

skillCommand
  .command('contract')
  .description('Gera o openapi.yaml a partir do system design')
  .option('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-contract — em implementação') })

skillCommand
  .command('build')
  .description('Implementa o código a partir do contrato OpenAPI')
  .option('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-build — em implementação') })

skillCommand
  .command('infra')
  .description('Containeriza e configura observabilidade')
  .option('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-infra — em implementação') })

skillCommand
  .command('docs')
  .description('Gera documentação de integração DX')
  .option('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-docs — em implementação') })

skillCommand
  .command('audit')
  .description('Revisa código contra OpenAPI e system design')
  .option('-p, --project <name>', 'Nome do projeto')
  .action(() => { console.log('o2-audit — em implementação') })

program.parse()
