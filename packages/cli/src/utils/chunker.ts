export interface Chunk {
  id: string
  content: string
  metadata: {
    source: string
    heading: string
    chunkIndex: number
  }
}

const MAX_CHARS = 1600  // ~400 tokens
const OVERLAP_CHARS = 200

// Divide o markdown por headings H1/H2/H3 preservando o contexto do heading
function splitByHeadings(content: string): Array<{ heading: string; body: string }> {
  const lines = content.split('\n')
  const sections: Array<{ heading: string; body: string }> = []
  let currentHeading = 'Introdução'
  let currentBody: string[] = []

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      if (currentBody.join('\n').trim()) {
        sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() })
      }
      currentHeading = line.replace(/^#+\s/, '').trim()
      currentBody = []
    } else {
      currentBody.push(line)
    }
  }

  if (currentBody.join('\n').trim()) {
    sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() })
  }

  return sections
}

// Divide seções longas em sub-chunks por parágrafo com overlap
function splitLongSection(heading: string, body: string): string[] {
  if (body.length <= MAX_CHARS) return [body]

  const paragraphs = body.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > MAX_CHARS && current) {
      chunks.push(current.trim())
      // overlap: pega o final do chunk atual como início do próximo
      const overlapStart = current.length - OVERLAP_CHARS
      current = current.slice(Math.max(0, overlapStart)) + '\n\n' + para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function chunkMarkdown(content: string, filename: string): Chunk[] {
  const sections = splitByHeadings(content)
  const chunks: Chunk[] = []
  let globalIndex = 0

  for (const section of sections) {
    const subChunks = splitLongSection(section.heading, section.body)

    for (const text of subChunks) {
      if (text.length < 50) continue // descarta ruído

      chunks.push({
        id: `${filename}::${globalIndex}`,
        content: `# ${section.heading}\n\n${text}`,
        metadata: {
          source: filename,
          heading: section.heading,
          chunkIndex: globalIndex,
        },
      })
      globalIndex++
    }
  }

  return chunks
}
