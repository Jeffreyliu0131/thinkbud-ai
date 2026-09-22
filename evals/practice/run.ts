import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { appendPracticeEvent, createPractice, gradeExpansion, practiceExport, practiceState, restorePractice,
  PRACTICE_RETENTION_MS, taskFor, type PracticeSession } from '../../src/lib/practice'

const SOURCE_FILES = [
  'src/lib/practice.ts', 'src/lib/practiceStorage.ts', 'src/lib/errorReporter.ts', 'src/App.tsx',
  'src/pages/PracticePage.tsx',
  'src/lib/demoLocale.ts',
  'src/lib/demoTranslations.ts',
  'src/components/DemoLanguageSwitch.tsx',
  'src/components/DemoLanguageSwitch.css',
  'src/lib/__tests__/demoLocale.test.tsx', 'src/pages/PracticePage.css', 'src/styles/demoFoundation.css', 'src/lib/__tests__/practice.test.ts',
  'src/pages/__tests__/PracticePage.test.tsx', 'evals/practice/run.ts',
  'scripts/check-evidence-consistency.mjs', 'package.json', 'package-lock.json',
]
const now = Date.parse('2026-09-07T00:00:00Z')
const cases: Array<{ id: string; requirement: string; passed: boolean }> = []
function check(id: string, requirement: string, condition: boolean) { cases.push({ id, requirement, passed: condition }) }
function rejects(action: () => unknown) { try { action(); return false } catch { return true } }
function submit(session: PracticeSession, values: number[]) {
  const state = practiceState(session)
  return appendPracticeEvent(session, { type: 'answer', taskId: taskFor(state)!.id, step: state.step, values, at: state.lastAt + 1 })
}
function guided(session: PracticeSession) {
  const task = taskFor(practiceState(session))!
  for (const value of [task.a, task.a * task.b, task.a * task.c, task.a * (task.b + task.c)]) session = submit(session, [value])
  return session
}
function checked(session: PracticeSession) {
  const task = taskFor(practiceState(session))!
  return submit(submit(session, [task.a, task.b, task.a, task.c]), [task.a * (task.b + task.c)])
}

let session = guided(createPractice('example-after-struggle', now))
check('PR-001', 'Guided steps cannot become independent mastery', practiceState(session).records[0].outcome === 'coached-completion')
session = appendPracticeEvent(session, { type: 'start-transfer', at: now + 10 })
check('PR-002', 'Independent checks reject in-task hints', rejects(() => appendPracticeEvent(session, { type: 'hint', at: now + 11 })))
check('PR-003', 'A final number alone cannot prove distributive expansion', rejects(() => submit(session, [161])))
check('PR-004', 'Valid factor and term reordering is accepted', gradeExpansion(taskFor(practiceState(session))!, [3, 7, 20, 7]))
check('PR-005', 'Missing distribution is rejected', !gradeExpansion(taskFor(practiceState(session))!, [7, 20, 1, 3]))
const retried = checked(submit(session, [7, 20, 1, 3]))
check('PR-006', 'Retries remain visible in the outcome', practiceState(retried).records[1].outcome === 'completed-after-retry')
const support = appendPracticeEvent(session, { type: 'return-to-coach', at: now + 11 })
check('PR-007', 'Help seeking is preserved and a new item is assigned', practiceState(support).records[1].outcome === 'needed-support' && taskFor(practiceState(support))?.id === 'C2')
session = checked(session)
const waiting = session
const due = practiceState(waiting).reviewDueAt!
check('PR-008', 'Delayed check remains closed before 24 hours', rejects(() => appendPracticeEvent(waiting, { type: 'start-review', at: due - 1 })))
check('PR-009', 'Preview input cannot change the actual session', rejects(() => appendPracticeEvent(waiting, { type: 'answer', taskId: 'PREVIEW-ONLY', step: 0, values: [5, 10, 5, 7], at: now + 100 })))
const exportBefore = practiceExport(waiting, now + 100)
check('PR-010', 'Export preserves pending review and excludes preview outcomes', exportBefore.phase === 'waiting' && !exportBefore.records.some(record => record.stage === 'review') && !exportBefore.scope.delayedPreviewIncluded)
session = checked(appendPracticeEvent(waiting, { type: 'start-review', at: due }))
check('PR-011', 'A due check produces a separate observation on another item', practiceState(session).phase === 'complete' && practiceState(session).records[2].taskId === 'R1')
check('PR-012', 'Saved progress is replayable, not a trusted mastery score', JSON.stringify(restorePractice(JSON.stringify(waiting), now + 100)) === JSON.stringify(waiting) && rejects(() => restorePractice(JSON.stringify({ ...waiting, phase: 'complete' }), now + 100)))
check('PR-013', 'Future and expired local records cannot be resumed', rejects(() => restorePractice(JSON.stringify(waiting), now - 1)) && rejects(() => restorePractice(JSON.stringify(waiting), now + PRACTICE_RETENTION_MS)))
let adaptive = createPractice('example-after-struggle', now)
adaptive = submit(submit(adaptive, [1]), [2])
check('PR-014', 'Repeated difficulty switches to a different example and preserves unfinished observations', practiceState(adaptive).help === 'example' && practiceState(adaptive).examples === 1 && practiceExport(adaptive, now + 100).inProgress?.mistakes === 2)
let questionFirst = createPractice('question-first', now)
questionFirst = submit(submit(questionFirst, [1]), [2])
check('PR-015', 'The question-first comparison policy records a hint', practiceState(questionFirst).help === 'hint' && practiceState(questionFirst).hints === 1)

const hash = createHash('sha256')
for (const file of SOURCE_FILES) { hash.update(file); hash.update('\0'); hash.update(await readFile(file)); hash.update('\0') }
const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const report = {
  generatedAt: new Date().toISOString(), sourceCommit: git(['rev-parse', 'HEAD']),
  sourceDirty: Boolean(git(['status', '--porcelain', '--', ...SOURCE_FILES])),
  sourceSnapshotHash: hash.digest('hex'), sourceSnapshotFiles: SOURCE_FILES,
  summary: { total: cases.length, passed: cases.filter(item => item.passed).length, failed: cases.filter(item => !item.passed).length },
  gate: { passed: cases.every(item => item.passed) },
  scope: { syntheticOnly: true, caseAuthor: 'Codex under the user-approved product brief', independentHumanReview: 'not_run',
    modelCalls: 0, networkCalls: 0, realChildRecords: 0, learningImpactValidated: false, delaySimulatedWithControlledClock: true },
  cases,
}
await mkdir('evals/practice/results', { recursive: true })
await mkdir('public', { recursive: true })
const json = JSON.stringify(report, null, 2) + '\n'
const markdown = `# ThinkBud practice workflow evaluation\n\n- Gate: **${report.gate.passed ? 'PASS' : 'FAIL'}**\n- Synthetic cases: **${report.summary.passed}/${report.summary.total}**\n- Source commit: \`${report.sourceCommit}\`\n- Source snapshot SHA-256: \`${report.sourceSnapshotHash}\`\n- Source dirty: \`${report.sourceDirty}\`\n- Model/network calls and real child records: **0/0/0**\n- Delay: controlled-clock simulation, not a real longitudinal study\n- Learning impact and independent human review: **not validated / not run**\n\n${cases.map(item => `- ${item.passed ? 'PASS' : 'FAIL'} ${item.id}: ${item.requirement}`).join('\n')}\n`
await Promise.all([
  writeFile('evals/practice/results/latest.json', json), writeFile('public/practice-eval-report.json', json),
  writeFile('evals/practice/results/latest.md', markdown),
])
console.log(`Practice workflow: ${report.gate.passed ? 'PASS' : 'FAIL'} (${report.summary.passed}/${report.summary.total}); synthetic controlled-clock cases only`)
if (!report.gate.passed) process.exitCode = 1
