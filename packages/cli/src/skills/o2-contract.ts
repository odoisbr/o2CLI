import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { stringify as yamlStringify } from 'yaml'
import { defineSkill, type SystemDesign } from '@o2/shared'
import { hashFile, writeLock, isLockValid } from '../utils/lock'
import { buildOpenAPISpec } from '../utils/openapi-builder'

interface ContractInputs {
  projectName: string
  memoryPath: string
  workspacePath: string
  force?: boolean
}

interface ContractOutputs {
  openapiPath: string
  pathsCount: number
  schemasCount: number
  skipped: boolean
}

export const o2ContractSkill = defineSkill<ContractInputs, ContractOutputs>({
  name: 'o2-contract',
  mode: 'executor',
  description: 'Gera openapi.yaml deterministicamente a partir do system-design.json',

  async execute(_ctx, inputs) {
    const designJsonPath = join(inputs.memoryPath, 'backend', '2-design', 'system-design.json')
    const openapiPath = join(inputs.workspacePath, 'openapi.yaml')

    if (!existsSync(designJsonPath)) {
      throw new Error(
        `system-design.json não encontrado em ${designJsonPath}.\n` +
        `Execute \`o2 run plan --project ${inputs.projectName}\` antes.`
      )
    }

    const designHash = hashFile(designJsonPath)!
    if (!inputs.force && isLockValid(inputs.workspacePath, 'o2-contract', designHash)) {
      const existing = readFileSync(openapiPath, 'utf-8')
      const lines = existing.split('\n')
      return {
        openapiPath,
        pathsCount: lines.filter((l) => /^\s{2}\/\S/.test(l)).length,
        schemasCount: 0,
        skipped: true,
      }
    }

    const design = JSON.parse(readFileSync(designJsonPath, 'utf-8')) as SystemDesign

    const spec = buildOpenAPISpec(design, inputs.projectName)

    // Sobrescreve sempre — system-design.json é a fonte da verdade
    const yaml = yamlStringify(spec, {
      indent: 2,
      lineWidth: 120,
      defaultStringType: 'PLAIN',
      defaultKeyType: 'PLAIN',
      aliasDuplicateObjects: false,
    })

    writeFileSync(openapiPath, yaml)

    writeLock(inputs.workspacePath, 'o2-contract', designHash)

    return {
      openapiPath,
      pathsCount: Object.keys(spec.paths).length,
      schemasCount: Object.keys(spec.components.schemas).length,
      skipped: false,
    }
  },
})
