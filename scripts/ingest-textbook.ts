import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ingestTextbook } from '../functions/_shared/rag/ingestion'
import type { TextbookChunkingOptions, TextbookSourceInput } from '../functions/_shared/rag/types'

interface MetadataFile {
  source: TextbookSourceInput
  document: {
    title: string
    documentKey?: string
    format?: 'markdown' | 'text'
  }
  chunking?: TextbookChunkingOptions
}

interface CliArguments {
  input: string
  metadata: string
  output: string
  format?: 'markdown' | 'text'
  maxChars?: number
  overlapChars?: number
}

function usage(): never {
  console.error('Usage: npm run rag:ingest -- --input <book.md|book.txt> --metadata <source.json> --output <manifest.json> [--format markdown|text] [--max-chars N] [--overlap-chars N]')
  process.exit(2)
}

function parseArguments(values: string[]): CliArguments {
  const parsed: Record<string, string> = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith('--') || value === undefined) usage()
    parsed[key.slice(2)] = value
  }
  if (!parsed.input || !parsed.metadata || !parsed.output) usage()
  if (parsed.format && parsed.format !== 'markdown' && parsed.format !== 'text') usage()
  const format = parsed.format === 'markdown' || parsed.format === 'text' ? parsed.format : undefined
  return {
    input: parsed.input,
    metadata: parsed.metadata,
    output: parsed.output,
    ...(format ? { format } : {}),
    ...(parsed['max-chars'] ? { maxChars: Number(parsed['max-chars']) } : {}),
    ...(parsed['overlap-chars'] ? { overlapChars: Number(parsed['overlap-chars']) } : {}),
  }
}

function inferFormat(filePath: string): 'markdown' | 'text' {
  return /\.md(?:own)?$/iu.test(filePath) ? 'markdown' : 'text'
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2))
  const metadata = JSON.parse(await readFile(args.metadata, 'utf8')) as MetadataFile
  const content = await readFile(args.input, 'utf8')
  const result = await ingestTextbook({
    source: metadata.source,
    document: {
      ...metadata.document,
      format: args.format ?? metadata.document.format ?? inferFormat(args.input),
      content,
    },
    chunking: {
      ...metadata.chunking,
      ...(args.maxChars === undefined ? {} : { maxChars: args.maxChars }),
      ...(args.overlapChars === undefined ? {} : { overlapChars: args.overlapChars }),
    },
  })
  await mkdir(path.dirname(args.output), { recursive: true })
  await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`Ingested ${result.chunks.length} chunks from ${result.document.title}`)
  console.log(`Source ID: ${result.source.id}`)
  console.log(`Production ready: ${result.source.productionReady}`)
  if (!result.source.productionReady) {
    console.log('Reason: source provenance/license attestation is incomplete or test-only.')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
