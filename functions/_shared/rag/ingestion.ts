import { sanitizeUntrustedText } from '../input-safety'
import { createTextbookSource, entityContract, TextbookContractError } from './contract'
import { sha256Hex, stableTextbookId } from './hash'
import type {
  ResolvedTextbookChunkingOptions,
  TextbookChapter,
  TextbookChunk,
  TextbookIngestionInput,
  TextbookIngestionResult,
  TextbookLocator,
  TextbookSection,
} from './types'

interface ContentLine {
  text: string
  line: number
  page?: number
}

interface SectionDraft {
  chapterOrdinal: number
  chapterTitle: string
  sectionOrdinal: number
  sectionTitle: string
  headingLevel: number
  lines: ContentLine[]
}

interface ChunkSlice {
  content: string
  charStart: number
  charEnd: number
}

const PAGE_MARKER = /^\s*(?:<!--\s*page\s*:\s*(\d+)\s*-->|\[PAGE\s+(\d+)\])\s*$/iu
const MARKDOWN_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/u

function resolveChunking(options: TextbookIngestionInput['chunking']): ResolvedTextbookChunkingOptions {
  const resolved = {
    maxChars: options?.maxChars ?? 1_200,
    overlapChars: options?.overlapChars ?? 160,
    minSplitChars: options?.minSplitChars ?? 80,
  }
  if (!Number.isInteger(resolved.maxChars) || resolved.maxChars < 64) {
    throw new TextbookContractError('chunking.maxChars must be an integer >= 64')
  }
  if (!Number.isInteger(resolved.overlapChars) || resolved.overlapChars < 0 || resolved.overlapChars >= resolved.maxChars) {
    throw new TextbookContractError('chunking.overlapChars must be >= 0 and less than maxChars')
  }
  if (!Number.isInteger(resolved.minSplitChars) || resolved.minSplitChars < 1 || resolved.minSplitChars > resolved.maxChars) {
    throw new TextbookContractError('chunking.minSplitChars must be within 1..maxChars')
  }
  return resolved
}

function parseSections(input: TextbookIngestionInput): SectionDraft[] {
  const rawLines = input.document.content.replace(/\r\n?/gu, '\n').split('\n')
  const sections: SectionDraft[] = []
  let currentPage: number | undefined
  let chapterOrdinal = 1
  let chapterTitle = input.document.title
  let sectionOrdinal = 1
  let sectionTitle = 'Overview'
  let headingLevel = 0
  let lines: ContentLine[] = []
  let chapterHasContent = false

  const flush = () => {
    if (!lines.some(item => item.text.trim().length > 0)) {
      lines = []
      return
    }
    sections.push({
      chapterOrdinal,
      chapterTitle,
      sectionOrdinal,
      sectionTitle,
      headingLevel,
      lines,
    })
    chapterHasContent = true
    lines = []
  }

  rawLines.forEach((rawLine, index) => {
    const marker = rawLine.match(PAGE_MARKER)
    if (marker) {
      currentPage = Number(marker[1] ?? marker[2])
      return
    }

    const heading = input.document.format === 'markdown' ? rawLine.match(MARKDOWN_HEADING) : null
    if (heading) {
      const level = heading[1].length
      const title = heading[2].normalize('NFKC').trim()
      if (level === 1) {
        flush()
        if (chapterHasContent) chapterOrdinal += 1
        chapterTitle = title
        chapterHasContent = false
        sectionOrdinal = 1
        sectionTitle = 'Overview'
        headingLevel = 1
      } else {
        flush()
        sectionOrdinal = chapterHasContent ? sectionOrdinal + 1 : 1
        sectionTitle = title
        headingLevel = level
      }
      return
    }

    const formFeedParts = rawLine.split('\f')
    formFeedParts.forEach((part, partIndex) => {
      if (partIndex > 0) currentPage = (currentPage ?? 0) + 1
      lines.push({ text: part, line: index + 1, ...(currentPage ? { page: currentPage } : {}) })
    })
  })
  flush()
  if (sections.length === 0) throw new TextbookContractError('document.content must contain non-empty text')
  return sections
}

function splitSection(content: string, options: ResolvedTextbookChunkingOptions): ChunkSlice[] {
  const chunks: ChunkSlice[] = []
  let start = 0

  while (start < content.length) {
    let end = Math.min(content.length, start + options.maxChars)
    if (end < content.length) {
      const minimum = start + options.minSplitChars
      const window = content.slice(start, end)
      const candidates = [window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf(' ')]
      const preferred = Math.max(...candidates)
      if (preferred >= options.minSplitChars && start + preferred >= minimum) end = start + preferred
    }

    const raw = content.slice(start, end)
    const leading = raw.length - raw.trimStart().length
    const trailing = raw.length - raw.trimEnd().length
    const actualStart = start + leading
    const actualEnd = end - trailing
    if (actualEnd > actualStart) {
      chunks.push({
        content: content.slice(actualStart, actualEnd),
        charStart: actualStart,
        charEnd: actualEnd,
      })
    }
    if (end >= content.length) break
    const next = Math.max(end - options.overlapChars, start + 1)
    start = next
    while (start < content.length && /\s/u.test(content[start])) start += 1
  }
  return chunks
}

function sectionText(lines: ContentLine[]): { content: string; offsets: number[] } {
  const offsets: number[] = []
  let cursor = 0
  const content = lines.map((line, index) => {
    offsets.push(cursor)
    cursor += line.text.length + (index < lines.length - 1 ? 1 : 0)
    return line.text
  }).join('\n')
  return { content, offsets }
}

function lineIndexAt(offsets: number[], charOffset: number): number {
  let index = 0
  for (let cursor = 1; cursor < offsets.length; cursor += 1) {
    if (offsets[cursor] > charOffset) break
    index = cursor
  }
  return index
}

function locatorFor(
  documentTitle: string,
  draft: SectionDraft,
  charStart?: number,
  charEnd?: number,
): TextbookLocator {
  const { offsets } = sectionText(draft.lines)
  const startIndex = charStart === undefined ? 0 : lineIndexAt(offsets, charStart)
  const endIndex = charEnd === undefined
    ? draft.lines.length - 1
    : lineIndexAt(offsets, Math.max(charStart ?? 0, charEnd - 1))
  const startLine = draft.lines[startIndex]
  const endLine = draft.lines[endIndex]
  return {
    documentTitle,
    chapterTitle: draft.chapterTitle,
    sectionTitle: draft.sectionTitle,
    sectionPath: `${documentTitle} > ${draft.chapterTitle} > ${draft.sectionTitle}`,
    lineStart: startLine.line,
    lineEnd: endLine.line,
    ...(startLine.page ? { pageStart: startLine.page } : {}),
    ...(endLine.page ? { pageEnd: endLine.page } : {}),
    ...(charStart === undefined ? {} : { charStart }),
    ...(charEnd === undefined ? {} : { charEnd }),
  }
}

export async function ingestTextbook(input: TextbookIngestionInput): Promise<TextbookIngestionResult> {
  const chunking = resolveChunking(input.chunking)
  const normalizedContent = input.document.content.replace(/\r\n?/gu, '\n')
  const documentContentHash = await sha256Hex(normalizedContent)
  const source = await createTextbookSource(input.source, documentContentHash)
  const documentKey = input.document.documentKey?.normalize('NFKC').trim() || input.document.title
  const documentId = await stableTextbookId('doc', [source.id, documentKey, input.document.format])
  const drafts = parseSections(input)
  const document = {
    kind: 'document' as const,
    ...entityContract(source, {
      id: documentId,
      title: input.document.title.normalize('NFKC').trim(),
      locator: { documentTitle: input.document.title, sectionPath: input.document.title },
      contentHash: documentContentHash,
    }),
    sourceId: source.id,
    documentKey,
    format: input.document.format,
  }

  const chapters: TextbookChapter[] = []
  const sections: TextbookSection[] = []
  const chunks: TextbookChunk[] = []
  const chapterByOrdinal = new Map<number, TextbookChapter>()

  for (const draft of drafts) {
    let chapter = chapterByOrdinal.get(draft.chapterOrdinal)
    if (!chapter) {
      const chapterDrafts = drafts.filter(item => item.chapterOrdinal === draft.chapterOrdinal)
      const chapterContent = chapterDrafts.flatMap(item => item.lines.map(line => line.text)).join('\n')
      const chapterId = await stableTextbookId('ch', [document.id, draft.chapterOrdinal, draft.chapterTitle])
      chapter = {
        kind: 'chapter',
        ...entityContract(source, {
          id: chapterId,
          title: draft.chapterTitle,
          locator: {
            documentTitle: document.title,
            chapterTitle: draft.chapterTitle,
            sectionPath: `${document.title} > ${draft.chapterTitle}`,
            lineStart: chapterDrafts[0].lines[0].line,
            lineEnd: chapterDrafts.at(-1)?.lines.at(-1)?.line,
            ...(chapterDrafts[0].lines[0].page ? { pageStart: chapterDrafts[0].lines[0].page } : {}),
            ...(chapterDrafts.at(-1)?.lines.at(-1)?.page ? { pageEnd: chapterDrafts.at(-1)?.lines.at(-1)?.page } : {}),
          },
          contentHash: await sha256Hex(chapterContent),
        }),
        sourceId: source.id,
        documentId: document.id,
        ordinal: draft.chapterOrdinal,
      }
      chapterByOrdinal.set(draft.chapterOrdinal, chapter)
      chapters.push(chapter)
    }

    const { content } = sectionText(draft.lines)
    const sectionId = await stableTextbookId('sec', [chapter.id, draft.sectionOrdinal, draft.sectionTitle])
    const section: TextbookSection = {
      kind: 'section',
      ...entityContract(source, {
        id: sectionId,
        title: draft.sectionTitle,
        locator: locatorFor(document.title, draft),
        contentHash: await sha256Hex(content),
      }),
      sourceId: source.id,
      documentId: document.id,
      chapterId: chapter.id,
      ordinal: draft.sectionOrdinal,
      headingLevel: draft.headingLevel,
    }
    sections.push(section)

    const slices = splitSection(content, chunking)
    for (let index = 0; index < slices.length; index += 1) {
      const slice = slices[index]
      const contentHash = await sha256Hex(slice.content)
      const id = await stableTextbookId('chk', [section.id, index + 1, contentHash])
      const sanitized = sanitizeUntrustedText(slice.content, { maxLength: Math.max(1, slice.content.length) })
      const chunkLocator = locatorFor(document.title, draft, slice.charStart, slice.charEnd)
      chunks.push({
        kind: 'chunk',
        ...entityContract(source, {
          id,
          title: `${draft.chapterTitle} — ${draft.sectionTitle} (${index + 1})`,
          locator: chunkLocator,
          contentHash,
        }),
        sourceId: source.id,
        documentId: document.id,
        chapterId: chapter.id,
        sectionId: section.id,
        sourceTitle: source.title,
        documentTitle: document.title,
        chapterTitle: chapter.title,
        sectionTitle: section.title,
        ordinal: index + 1,
        content: slice.content,
        untrusted: true,
        inputSafetyFlags: sanitized.flags,
      })
    }
  }

  return {
    schemaVersion: 1,
    source,
    document,
    chapters,
    sections,
    chunks,
    chunking,
  }
}
