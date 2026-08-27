import { stableTextbookId } from './hash'
import type {
  TextbookEntityContract,
  TextbookGradeRange,
  TextbookLicense,
  TextbookLocator,
  TextbookProvenance,
  TextbookSource,
  TextbookSourceInput,
} from './types'

export class TextbookContractError extends Error {
  readonly code = 'TEXTBOOK_CONTRACT_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'TextbookContractError'
  }
}

function nonEmpty(value: string | undefined, field: string): string {
  const resolved = value?.normalize('NFKC').trim()
  if (!resolved) throw new TextbookContractError(`${field} must be a non-empty string`)
  return resolved
}

export function validateGradeRange(grade: TextbookGradeRange): TextbookGradeRange {
  if (!Number.isInteger(grade?.min) || !Number.isInteger(grade?.max)) {
    throw new TextbookContractError('grade min/max must be integers')
  }
  if (grade.min < 1 || grade.max > 12 || grade.min > grade.max) {
    throw new TextbookContractError('grade range must be ordered within 1-12')
  }
  return { min: grade.min, max: grade.max, label: nonEmpty(grade.label, 'grade.label') }
}

export function normalizeLicense(input?: Partial<TextbookLicense>): TextbookLicense {
  const usage = input?.usage ?? 'unknown'
  if (!['production-authorized', 'test-only', 'unknown'].includes(usage)) {
    throw new TextbookContractError('license.usage is invalid')
  }
  return {
    identifier: input?.identifier?.normalize('NFKC').trim() || 'UNKNOWN',
    usage,
    ...(input?.url ? { url: input.url.trim() } : {}),
  }
}

export function normalizeProvenance(input?: Partial<TextbookProvenance>): TextbookProvenance {
  return {
    origin: input?.origin?.normalize('NFKC').trim() || 'unknown',
    owner: input?.owner?.normalize('NFKC').trim() || null,
    ownerAttested: input?.ownerAttested === true,
    authorizedForProduction: input?.authorizedForProduction === true,
    ...(input?.attestedAt ? { attestedAt: input.attestedAt } : {}),
    ...(input?.notes ? { notes: input.notes.normalize('NFKC').trim() } : {}),
  }
}

export function isProductionReady(
  license: TextbookLicense,
  provenance: TextbookProvenance,
): boolean {
  return license.identifier !== 'UNKNOWN'
    && license.usage === 'production-authorized'
    && provenance.origin !== 'unknown'
    && provenance.owner !== null
    && provenance.ownerAttested
    && provenance.authorizedForProduction
    && Boolean(provenance.attestedAt)
}

export interface NormalizedSourceMetadata {
  namespace: string
  externalId?: string
  title: string
  grade: TextbookGradeRange
  subject: string
  version: string
  license: TextbookLicense
  provenance: TextbookProvenance
  productionReady: boolean
}

export function normalizeSourceMetadata(input: TextbookSourceInput): NormalizedSourceMetadata {
  const license = normalizeLicense(input.license)
  const provenance = normalizeProvenance(input.provenance)
  const externalId = input.externalId?.normalize('NFKC').trim()
  return {
    namespace: input.namespace?.normalize('NFKC').trim() || 'thinkbud-textbook',
    ...(externalId ? { externalId } : {}),
    title: nonEmpty(input.title, 'source.title'),
    grade: validateGradeRange(input.grade),
    subject: nonEmpty(input.subject, 'source.subject').toLowerCase(),
    version: nonEmpty(input.version, 'source.version'),
    license,
    provenance,
    productionReady: isProductionReady(license, provenance),
  }
}

export async function createTextbookSource(
  input: TextbookSourceInput,
  contentHash: string,
): Promise<TextbookSource> {
  const metadata = normalizeSourceMetadata(input)
  const id = await stableTextbookId('src', [
    metadata.namespace,
    metadata.externalId ?? metadata.title,
    metadata.version,
  ])
  return {
    kind: 'source',
    id,
    ...metadata,
    locator: {
      documentTitle: metadata.title,
      sectionPath: metadata.title,
    },
    contentHash,
  }
}

export function entityContract(
  source: TextbookSource,
  values: Pick<TextbookEntityContract, 'id' | 'title' | 'locator' | 'contentHash'>,
): TextbookEntityContract {
  return {
    ...values,
    grade: source.grade,
    subject: source.subject,
    version: source.version,
    license: source.license,
    provenance: source.provenance,
    productionReady: source.productionReady,
  }
}

export function locatorPath(locator: TextbookLocator): string {
  return [locator.documentTitle, locator.chapterTitle, locator.sectionTitle]
    .filter(Boolean)
    .join(' > ')
}
