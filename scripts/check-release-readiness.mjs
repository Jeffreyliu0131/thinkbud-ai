import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const config = JSON.parse(await readFile(path.join(root, 'release/readiness.config.json'), 'utf8'))

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

async function readJson(relativePath) {
  if (!(await exists(relativePath))) return null
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
}

const deterministic = await readJson(config.evidencePaths.deterministicEval)
const assets = await readJson(config.evidencePaths.assetManifest)
const privacy = await readJson(config.evidencePaths.privacyApproval)
const live = await readJson(config.evidencePaths.liveModelEvidence)
const human = await readJson(config.evidencePaths.humanReview)
const checks = [
  {
    id: 'deterministic-eval',
    pass: deterministic?.gate?.passed === true,
    detail: deterministic ? `dataset ${deterministic.datasetHash}` : 'run npm run eval:gate',
  },
  {
    id: 'project-license',
    pass: await exists('LICENSE'),
    detail: 'User must explicitly choose a license; this task does not grant legal rights.',
  },
  {
    id: 'asset-attestation',
    pass: Array.isArray(assets?.assets) && assets.assets.every(item => item.ownerAttested === true),
    detail: 'Confirm origin and reuse rights for icons and inline illustrations.',
  },
  {
    id: 'privacy-child-safety-approval',
    pass: privacy?.approved === true && Object.values(privacy?.checks ?? {}).every(Boolean),
    detail: 'DPIA, consent/notice, retention/deletion, vendor processing, admin access, and incident procedure remain open.',
  },
  {
    id: 'fresh-live-model-evidence',
    pass: live?.gate?.passed === true && live?.scope?.productionModelCalls > 0,
    detail: 'Run with explicitly approved credentials and record model/version/config.',
  },
  {
    id: 'blinded-human-review',
    pass: human?.reviewComplete === true && human?.releaseRecommendation === 'pass',
    detail: 'Two-rater review is required for fresh model outputs; model judge is advisory.',
  },
]

const passed = checks.every(check => check.pass)
console.log(`ThinkBud full release gate: ${passed ? 'PASS' : 'FAIL'}`)
for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.id} — ${check.detail}`)
if (!passed) process.exitCode = 1
