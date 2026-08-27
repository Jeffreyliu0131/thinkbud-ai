import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const assetManifest = JSON.parse(await readFile(path.join(root, 'provenance/assets.json'), 'utf8'))
const packages = lock.packages ?? {}
const rootPackage = packages[''] ?? {}
const directNames = new Set([
  ...Object.keys(rootPackage.dependencies ?? {}),
  ...Object.keys(rootPackage.devDependencies ?? {}),
])

const dependencies = Object.entries(packages)
  .filter(([location]) => location.startsWith('node_modules/'))
  .map(([location, value]) => ({
    name: location.replace(/^node_modules\//, ''),
    version: value.version ?? 'unknown',
    license: value.license ?? 'UNKNOWN',
    direct: directNames.has(location.replace(/^node_modules\//, '')),
    runtime: Object.hasOwn(rootPackage.dependencies ?? {}, location.replace(/^node_modules\//, '')),
  }))

const missingLicense = dependencies.filter(item => item.license === 'UNKNOWN')
const reviewLicenses = dependencies.filter(item => /(LGPL|MPL|CC-BY|SEE LICENSE)/i.test(item.license))
const assets = []
for (const item of assetManifest.assets) {
  const absolute = path.join(root, item.path)
  let exists = true
  let sha256 = null
  try {
    await access(absolute)
    sha256 = createHash('sha256').update(await readFile(absolute)).digest('hex')
  } catch {
    exists = false
  }
  assets.push({ ...item, exists, sha256 })
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  dependencySummary: {
    total: dependencies.length,
    direct: dependencies.filter(item => item.direct).length,
    runtimeDirect: dependencies.filter(item => item.direct && item.runtime).length,
    missingLicense: missingLicense.length,
    reviewLicensePackages: reviewLicenses.length,
  },
  missingLicense,
  reviewLicenses,
  directDependencies: dependencies.filter(item => item.direct).sort((a, b) => a.name.localeCompare(b.name)),
  assetSummary: {
    inventoried: assets.length,
    missing: assets.filter(item => !item.exists).length,
    ownerAttestationPending: assets.filter(item => !item.ownerAttested).length,
  },
  assets,
  interpretation: {
    dependencyInventoryPass: missingLicense.length === 0,
    publicReleaseReady: false,
    reason: 'Project license and owner asset attestations are intentionally pending user decision.',
  },
}

const outputDir = path.join(root, 'artifacts/provenance')
await mkdir(outputDir, { recursive: true })
await writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`Dependency licenses inventoried: ${dependencies.length}`)
console.log(`Missing dependency license metadata: ${missingLicense.length}`)
console.log(`Asset attestations pending: ${report.assetSummary.ownerAttestationPending}`)
if (missingLicense.length > 0 || report.assetSummary.missing > 0) process.exitCode = 1
