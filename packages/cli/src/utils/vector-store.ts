import { ChromaClient } from 'chromadb'
import type { Chunk } from './chunker'
import type { GatewayClient } from './gateway-client'

const CHROMA_URL = 'http://localhost:8000'

// Embedding function que delega ao gateway para manter rastreamento de custo central
function makeGatewayEmbedder(client: GatewayClient) {
  return {
    generate: async (texts: string[]): Promise<number[][]> => {
      const res = await client.generateEmbeddings(texts)
      return res.embeddings
    },
  }
}

function collectionName(projectName: string): string {
  return `o2_${projectName.replace(/[^a-z0-9]/g, '_')}`
}

export async function upsertChunks(
  projectName: string,
  chunks: Chunk[],
  gatewayClient: GatewayClient,
): Promise<{ stored: number }> {
  const chroma = new ChromaClient({ path: CHROMA_URL })
  const embedder = makeGatewayEmbedder(gatewayClient)

  const collection = await chroma.getOrCreateCollection({
    name: collectionName(projectName),
    embeddingFunction: embedder,
    metadata: { project: projectName, updatedAt: new Date().toISOString() },
  })

  // Deleta chunks anteriores da mesma fonte para garantir idempotência
  const sources = [...new Set(chunks.map((c) => c.metadata.source))]
  for (const source of sources) {
    try {
      const existing = await collection.get({ where: { source } })
      if (existing.ids.length > 0) {
        await collection.delete({ ids: existing.ids })
      }
    } catch {
      // coleção nova — ignora
    }
  }

  await collection.add({
    ids: chunks.map((c) => c.id),
    documents: chunks.map((c) => c.content),
    metadatas: chunks.map((c) => c.metadata),
  })

  return { stored: chunks.length }
}

export async function queryChunks(
  projectName: string,
  query: string,
  gatewayClient: GatewayClient,
  nResults = 5,
): Promise<Array<{ content: string; metadata: Record<string, string | number | boolean> }>> {
  const chroma = new ChromaClient({ path: CHROMA_URL })
  const embedder = makeGatewayEmbedder(gatewayClient)

  const collection = await chroma.getCollection({
    name: collectionName(projectName),
    embeddingFunction: embedder,
  })

  const results = await collection.query({ queryTexts: [query], nResults })

  return (results.documents[0] ?? []).map((doc, i) => ({
    content: doc ?? '',
    metadata: (results.metadatas[0]?.[i] ?? {}) as Record<string, string | number | boolean>,
  }))
}
