import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const files = execFileSync(
  'git',
  ['-c', 'core.quotePath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8' },
).split('\0').filter(Boolean)

const failures = []
const forbiddenPathRules = [
  {
    id: 'private-agent-directory',
    matches: file => /(^|\/)(?:\.planning|\.claude)(\/|$)/.test(file),
  },
  {
    id: 'deployment-document',
    matches: file => /(^|\/)DEPLOYMENT\.md$/i.test(file),
  },
  {
    id: 'local-decisiontrace-output',
    matches: file => /(^|\/)\.decisiontrace\/(?:cache|reports)(\/|$)/.test(file),
  },
  {
    id: 'environment-file',
    matches: file => /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example') && file !== '.env.example',
  },
]

for (const file of files) {
  for (const rule of forbiddenPathRules) {
    if (rule.matches(file)) failures.push({ rule: rule.id, file })
  }
}

const contentRules = [
  { id: 'macos-user-path', pattern: /\/Users\/[A-Za-z0-9._-]+\//g },
  { id: 'linux-user-path', pattern: /\/home\/[A-Za-z0-9._-]+\//g },
  { id: 'windows-user-path', pattern: /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/g },
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { id: 'openai-style-key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  {
    id: 'configured-production-id',
    pattern: /\b(?:account_id|zone_id|database_id)\s*[:=]\s*['"][A-Za-z0-9_-]{8,}['"]/gi,
  },
  {
    id: 'private-revision-reference',
    pattern: /\bprivate(?:\s+repository|\s+repo|\s+commit|\s+sha)[^\n]{0,80}\b[a-f0-9]{40}\b/gi,
  },
]

const scanSkip = new Set([
  'package-lock.json',
  'scripts/check-public-boundary.mjs',
])
const allowedEmailDomains = new Set(['example.com', 'example.test', 'users.noreply.github.com'])
const emailPattern = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g

for (const file of files) {
  if (scanSkip.has(file)) continue
  let bytes
  try {
    bytes = await readFile(path.join(root, file))
  } catch {
    failures.push({ rule: 'unreadable-file', file })
    continue
  }
  if (bytes.includes(0)) continue
  const content = bytes.toString('utf8')

  for (const rule of contentRules) {
    rule.pattern.lastIndex = 0
    if (rule.pattern.test(content)) failures.push({ rule: rule.id, file })
  }

  emailPattern.lastIndex = 0
  for (const match of content.matchAll(emailPattern)) {
    if (!allowedEmailDomains.has(match[1].toLowerCase())) {
      failures.push({ rule: 'personal-email', file })
      break
    }
  }
}

if (failures.length > 0) {
  console.error('Public boundary check: FAIL')
  for (const failure of failures) console.error(`- [${failure.rule}] ${failure.file}`)
  process.exitCode = 1
} else {
  console.log(`Public boundary check: PASS (${files.length} tracked/unignored files scanned)`)
}
