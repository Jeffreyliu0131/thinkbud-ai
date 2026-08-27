import type { InputSafetyFlag } from '../input-safety'

export type TextbookFormat = 'markdown' | 'text'

export interface TextbookGradeRange {
  min: number
  max: number
  label: string
}

export interface TextbookLicense {
  identifier: string
  usage: 'production-authorized' | 'test-only' | 'unknown'
  url?: string
}

export interface TextbookProvenance {
  origin: string
  owner: string | null
  ownerAttested: boolean
  authorizedForProduction: boolean
  attestedAt?: string
  notes?: string
}

export interface TextbookLocator {
  documentTitle: string
  chapterTitle?: string
  sectionTitle?: string
  sectionPath: string
  lineStart?: number
  lineEnd?: number
  pageStart?: number
  pageEnd?: number
  charStart?: number
  charEnd?: number
}

export interface TextbookEntityContract {
  id: string
  title: string
  grade: TextbookGradeRange
  subject: string
  version: string
  license: TextbookLicense
  provenance: TextbookProvenance
  locator: TextbookLocator
  contentHash: string
  productionReady: boolean
}

export interface TextbookSource extends TextbookEntityContract {
  kind: 'source'
  namespace: string
  externalId?: string
}

export interface TextbookDocument extends TextbookEntityContract {
  kind: 'document'
  sourceId: string
  documentKey: string
  format: TextbookFormat
}

export interface TextbookChapter extends TextbookEntityContract {
  kind: 'chapter'
  sourceId: string
  documentId: string
  ordinal: number
}

export interface TextbookSection extends TextbookEntityContract {
  kind: 'section'
  sourceId: string
  documentId: string
  chapterId: string
  ordinal: number
  headingLevel: number
}

export interface TextbookChunk extends TextbookEntityContract {
  kind: 'chunk'
  sourceId: string
  documentId: string
  chapterId: string
  sectionId: string
  sourceTitle: string
  documentTitle: string
  chapterTitle: string
  sectionTitle: string
  ordinal: number
  content: string
  untrusted: true
  inputSafetyFlags: InputSafetyFlag[]
}

export interface TextbookSourceInput {
  namespace?: string
  externalId?: string
  title: string
  grade: TextbookGradeRange
  subject: string
  version: string
  license?: Partial<TextbookLicense>
  provenance?: Partial<TextbookProvenance>
}

export interface TextbookDocumentInput {
  documentKey?: string
  title: string
  format: TextbookFormat
  content: string
}

export interface TextbookChunkingOptions {
  maxChars?: number
  overlapChars?: number
  minSplitChars?: number
}

export interface TextbookIngestionInput {
  source: TextbookSourceInput
  document: TextbookDocumentInput
  chunking?: TextbookChunkingOptions
}

export interface ResolvedTextbookChunkingOptions {
  maxChars: number
  overlapChars: number
  minSplitChars: number
}

export interface TextbookIngestionResult {
  schemaVersion: 1
  source: TextbookSource
  document: TextbookDocument
  chapters: TextbookChapter[]
  sections: TextbookSection[]
  chunks: TextbookChunk[]
  chunking: ResolvedTextbookChunkingOptions
}

export interface TextbookFilters {
  subject?: string
  grade?: number
  gradeLabel?: string
  sourceIds?: string[]
}

export interface RagCitation {
  citationId: string
  sourceId: string
  sourceTitle: string
  documentId: string
  documentTitle: string
  chapterId: string
  chapterTitle: string
  sectionId: string
  sectionTitle: string
  chunkId: string
  contentHash: string
  locator: TextbookLocator
}
