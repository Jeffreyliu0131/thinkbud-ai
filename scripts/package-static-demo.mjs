import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// Explicit public assets only. Vite's demo publicDir is disabled, so worklets,
// Cloudflare headers, Functions and operational files cannot ride along.
const output = 'dist-demo'
mkdirSync(`${output}/icons`, { recursive: true })
for (const file of ['favicon.svg', 'icons/icon-192.png', 'eval-report.json', 'rag-eval-report.json', 'practice-eval-report.json']) {
  cpSync(`public/${file}`, `${output}/${file}`)
}
writeFileSync(`${output}/.nojekyll`, '')
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"
const index = readFileSync(`${output}/index.html`, 'utf8')
writeFileSync(`${output}/index.html`, index.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = `${directory}/${entry.name}`
    return entry.isDirectory() ? walk(file) : [file]
  })
}
const sourceSnapshotFiles = [...walk('src'), ...walk('shared'), ...walk('scripts'), 'package.json', 'package-lock.json', 'vite.config.ts', 'index.html', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
  'public/favicon.svg', 'public/icons/icon-192.png', 'public/eval-report.json', 'public/rag-eval-report.json', 'public/practice-eval-report.json'].sort()
const sourceHash = createHash('sha256')
for (const file of sourceSnapshotFiles) sourceHash.update(file).update('\0').update(readFileSync(file)).update('\0')
writeFileSync(`${output}/build-info.json`, JSON.stringify({
  sourceSnapshotHash: sourceHash.digest('hex'), sourceSnapshotFiles,
  sourceRepository: 'Jeffreyliu0131/thinkbud-ai', sourceCommit: git('rev-parse', 'HEAD'),
  sourceDirty: Boolean(git('status', '--porcelain', '--untracked-files=normal', '--', 'src', 'functions', 'shared', 'scripts', 'package.json', 'package-lock.json', 'vite.config.ts', 'index.html', '.github')),
  mode: 'static-demo', base: '/thinkbud-ai/', routing: 'hash', backend: false,
  modelCalls: false, rtcEnabled: false,
}, null, 2) + '\n')
