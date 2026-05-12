import type { SkillDefinition, SkillName } from '@o2/shared'

// Registro central de skills — cada skill é um módulo independente
// com mode declarado (executor | compiler) que o roteador híbrido usa
// para decidir entre chamada direta ao Gateway ou compilação de .o2-task.md

const registry = new Map<SkillName, SkillDefinition>()

export function registerSkill(skill: SkillDefinition): void {
  registry.set(skill.name, skill)
}

export function getSkill(name: SkillName): SkillDefinition {
  const skill = registry.get(name)
  if (!skill) throw new Error(`Skill não registrada: ${name}`)
  return skill
}

export function listSkills(): SkillDefinition[] {
  return [...registry.values()]
}
