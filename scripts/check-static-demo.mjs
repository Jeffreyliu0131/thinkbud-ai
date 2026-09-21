import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = 'dist-demo'
const info = JSON.parse(readFileSync(`${root}/build-info.json`, 'utf8'))
assert.equal(info.mode, 'static-demo')
assert.equal(info.base, '/thinkbud-ai/')
assert.equal(info.backend, false)
assert.equal(info.routing, 'hash')
assert.ok(Array.isArray(info.sourceSnapshotFiles) && info.sourceSnapshotFiles.length > 0)
const sourceHash = createHash('sha256')
for (const file of info.sourceSnapshotFiles) sourceHash.update(file).update('\0').update(readFileSync(file)).update('\0')
assert.equal(info.sourceSnapshotHash, sourceHash.digest('hex'), 'Build must match current demo source bytes')
function files(dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'No symlinks in deploy package')
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? files(file) : [file]
  })
}
const names = files()
for (const file of names) {
  assert.ok(!/functions|_worker|wrangler|\.env|\.dev\.vars|worklet|rtc-sdk|service-worker|(?:^|\/)sw\.js/.test(file), `Unexpected runtime file: ${file}`)
  if (file.endsWith('.js')) {
    const text = readFileSync(file, 'utf8')
    assert.ok(!/\/api\/(?:auth|chat|rtc|ocr|stt|tts|error-report)|ark\.cn-beijing|volcengineapi\.com|getUserMedia/.test(text), `Service code found: ${file}`)
  }
}
const index = readFileSync(`${root}/index.html`, 'utf8')
assert.match(index, /connect-src 'self'/)
for (const [, url] of index.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
  assert.ok(url.startsWith(info.base), `Root-relative asset escaped Pages base: ${url}`)
  assert.ok(existsSync(path.join(root, url.slice(info.base.length))), `Missing static asset: ${url}`)
}
for (const file of ['eval-report.json', 'rag-eval-report.json', 'practice-eval-report.json']) {
  assert.deepEqual(readFileSync(`${root}/${file}`), readFileSync(`public/${file}`))
}
console.log(`Static demo package: PASS (${names.length} files; base-aware assets; no service runtime)`)
