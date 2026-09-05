import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const failures = []

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

async function bytes(relativePath) {
  return readFile(path.join(root, relativePath))
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function check(condition, message) {
  if (!condition) failures.push(message)
}

async function snapshotHash(files) {
  const hasher = createHash('sha256')
  for (const relativePath of files) {
    hasher.update(relativePath)
    hasher.update('\0')
    hasher.update(await bytes(relativePath))
    hasher.update('\0')
  }
  return hasher.digest('hex')
}

const head = git(['rev-parse', 'HEAD'])
const behavior = await json('evals/results/latest.json')
const rag = await json('evals/rag/results/latest.json')
const publicBehavior = await bytes('public/eval-report.json')
const publicRag = await bytes('public/rag-eval-report.json')
const behaviorBytes = await bytes('evals/results/latest.json')
const ragBytes = await bytes('evals/rag/results/latest.json')

for (const [label, report] of [['behavior', behavior], ['RAG', rag]]) {
  check(/^[a-f0-9]{40}$/.test(report.sourceCommit ?? ''), `${label} must name its Git base revision`)
  check(typeof report.sourceDirty === 'boolean', `${label} must disclose capture working-tree status`)
  try { git(['cat-file', '-e', `${report.sourceCommit}^{commit}`]) }
  catch { check(false, `${label} base revision is unavailable; use full checkout history`) }
  check(report.gate?.passed === true, `${label} deterministic gate must pass`)
  check(Array.isArray(report.sourceSnapshotFiles), `${label} report must list sourceSnapshotFiles`)
  if (Array.isArray(report.sourceSnapshotFiles)) {
    check(
      await snapshotHash(report.sourceSnapshotFiles) === report.sourceSnapshotHash,
      `${label} source snapshot hash does not match current evidence-commit files`,
    )
  }
}

check(Buffer.compare(publicBehavior, behaviorBytes) === 0, 'public/eval-report.json must match evals/results/latest.json byte-for-byte')
check(Buffer.compare(publicRag, ragBytes) === 0, 'public/rag-eval-report.json must match evals/rag/results/latest.json byte-for-byte')

const behaviorMarkdown = await readFile(path.join(root, 'evals/results/latest.md'), 'utf8')
const ragMarkdown = await readFile(path.join(root, 'evals/rag/results/latest.md'), 'utf8')
check(behaviorMarkdown.includes(`Source commit: \`${behavior.sourceCommit}\``), 'behavior Markdown source commit is inconsistent')
check(ragMarkdown.includes(`Source commit: \`${rag.sourceCommit}\``), 'RAG Markdown source commit is inconsistent')

const showcase = await json('docs/showcase/capture-manifest.json')
check(/^[a-f0-9]{40}$/.test(showcase.sourceCommit), 'showcase must identify its historical capture revision')
check(showcase.sourceDirty === false, 'showcase manifest sourceDirty must be false')
for (const item of [...(showcase.reports ?? []), ...(showcase.captures ?? [])]) {
  const actual = sha256(await bytes(item.path))
  check(actual === item.sha256, `${item.path} hash does not match showcase manifest`)
}

const provenance = await json('artifacts/provenance/latest.json')
check(provenance.dependencySummary?.missingLicense === 0, 'dependency license metadata is incomplete')
check(provenance.assetSummary?.missing === 0, 'a provenance-inventoried asset is missing')
for (const asset of provenance.assets ?? []) {
  check(asset.exists === true, `${asset.path} is marked missing in provenance evidence`)
  check(sha256(await bytes(asset.path)) === asset.sha256, `${asset.path} hash does not match provenance evidence`)
}

if (failures.length > 0) {
  console.error('Evidence consistency: FAIL')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Evidence consistency: PASS (content snapshots verified against working tree at base ${head.slice(0, 8)})`)
  console.log(`Behavior ${behavior.summary.matched}/${behavior.summary.total}; RAG ${rag.summary.passed}/${rag.summary.total}; captured sourceDirty=${behavior.sourceDirty}/${rag.sourceDirty}`)
}
