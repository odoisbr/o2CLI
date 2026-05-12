import * as p from '@clack/prompts'
import { engineExists, writeEngine, ENGINE_PATH_EXPORT } from '../utils/config'
import type { EngineConfig, InterfaceMode } from '@o2/shared'

const DEFAULT_GATEWAY = 'http://localhost:3000'

export async function onboard(): Promise<void> {
  p.intro('o2 — Configuração do Motor')

  if (engineExists()) {
    const overwrite = await p.confirm({
      message: `Configuração existente detectada em ${ENGINE_PATH_EXPORT}. Reconfigurar?`,
      initialValue: false,
    })

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Configuração mantida.')
      return
    }
  }

  const gatewayUrl = await p.text({
    message: 'URL do Gateway o2',
    placeholder: DEFAULT_GATEWAY,
    defaultValue: DEFAULT_GATEWAY,
    validate: (v) => {
      try { new URL(v); return } catch { return 'URL inválida' }
    },
  })
  if (p.isCancel(gatewayUrl)) { p.cancel('Abortado.'); return }

  const apiKey = await p.text({
    message: 'Chave de API do Gateway',
    placeholder: 'o2_sk_...',
    validate: (v) => v.length < 8 ? 'Chave muito curta' : undefined,
  })
  if (p.isCancel(apiKey)) { p.cancel('Abortado.'); return }

  const defaultInterface = await p.select<InterfaceMode>({
    message: 'Interface padrão de compilação',
    options: [
      { value: 'claude-code', label: 'Claude Code (terminal)' },
      { value: 'cursor', label: 'Cursor' },
      { value: 'cline', label: 'Cline (VS Code)' },
      { value: 'clipboard', label: 'Área de transferência' },
    ],
  })
  if (p.isCancel(defaultInterface)) { p.cancel('Abortado.'); return }

  const config: EngineConfig = {
    version: '1',
    gatewayUrl: gatewayUrl as string,
    apiKey: apiKey as string,
    defaultInterface,
    createdAt: new Date().toISOString(),
  }

  const s = p.spinner()
  s.start('Salvando configuração')

  try {
    writeEngine(config)
    s.stop('Motor configurado com sucesso')
    p.outro(`Configuração salva em ${ENGINE_PATH_EXPORT}`)
  } catch (err) {
    s.stop('Erro ao salvar')
    p.cancel(String(err))
    process.exit(1)
  }
}
