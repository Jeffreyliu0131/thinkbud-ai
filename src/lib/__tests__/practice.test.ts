import { describe, expect, it, vi, afterEach } from 'vitest'
import { appendPracticeEvent, createPractice, gradeExpansion, parsePracticeNumbers, practiceExport, practiceState,
  restorePractice, REVIEW_DELAY_MS, PRACTICE_RETENTION_MS, PRACTICE_STORAGE_KEY, taskFor, type PracticeSession } from '../practice'
import { clearPractice, loadPractice, savePractice } from '../practiceStorage'
import { reportError } from '../errorReporter'

const NOW = Date.parse('2026-09-07T04:00:00Z')
function answer(session: PracticeSession, values: number[], at = practiceState(session).lastAt + 1) {
  const state = practiceState(session)
  return appendPracticeEvent(session, { type: 'answer', taskId: taskFor(state)!.id, step: state.step, values, at })
}
function finishCoach(session: PracticeSession) {
  const task = taskFor(practiceState(session))!
  for (const value of [task.a, task.a * task.b, task.a * task.c, task.a * (task.b + task.c)]) session = answer(session, [value])
  return session
}
function finishCheck(session: PracticeSession) {
  const task = taskFor(practiceState(session))!
  session = answer(session, [task.a, task.b, task.a, task.c])
  return answer(session, [task.a * (task.b + task.c)])
}
function waitingSession() {
  let session = finishCoach(createPractice('example-after-struggle', NOW))
  session = appendPracticeEvent(session, { type: 'start-transfer', at: NOW + 10 })
  return finishCheck(session)
}

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); window.history.replaceState({}, '', '/') })

describe('distributive practice evidence', () => {
  it('separates guided completion, transfer, and a gated delayed local check', () => {
    let session = waitingSession()
    let state = practiceState(session)
    expect(state.phase).toBe('waiting')
    expect(state.records.map(record => record.outcome)).toEqual(['coached-completion', 'first-attempt-without-hints'])
    const due = state.reviewDueAt!
    expect(() => appendPracticeEvent(session, { type: 'start-review', at: due - 1 })).toThrow(/not due/)
    session = appendPracticeEvent(session, { type: 'start-review', at: due })
    session = finishCheck(session); state = practiceState(session)
    expect(state.phase).toBe('complete')
    expect(state.records.map(record => record.taskId)).toEqual(['C1', 'T1', 'R1'])
    expect(state.records[2].startedAt - state.records[1].finishedAt).toBeGreaterThanOrEqual(REVIEW_DELAY_MS)
    expect(practiceExport(session, due + 100).scope.learningImpactValidated).toBe(false)
  })

  it('accepts commuted factors and terms without accepting a missed distributive term', () => {
    const task = { id: 'case', a: 7, b: 20, c: 3 }
    expect(gradeExpansion(task, [3, 7, 20, 7])).toBe(true)
    expect(gradeExpansion(task, [7, 20, 1, 3])).toBe(false)
    expect(gradeExpansion(task, [1, 140, 1, 21])).toBe(false)
  })

  it('cannot mark transfer complete from the final number alone', () => {
    const guided = finishCoach(createPractice('question-first', NOW))
    const session = appendPracticeEvent(guided, { type: 'start-transfer', at: NOW + 10 })
    expect(() => answer(session, [161])).toThrow(/every field/)
    expect(practiceState(session).records).toHaveLength(1)
  })

  it.each(['question-first', 'example-after-struggle'] as const)('records the actual escalation for %s', policy => {
    let session = createPractice(policy, NOW)
    session = answer(session, [1]); session = answer(session, [2])
    expect(practiceState(session).help).toBe(policy === 'question-first' ? 'hint' : 'example')
    expect(practiceExport(session, NOW + 10).inProgress).toMatchObject({ mistakes: 2, completed: false })
    session = finishCoach(session)
    const record = practiceState(session).records[0]
    expect(record.mistakes).toBe(2)
    expect(record.hints + record.examples).toBe(1)
    expect(record.outcome).toBe('coached-completion')
  })

  it('records retries separately from first-attempt transfer completion', () => {
    let session = finishCoach(createPractice('question-first', NOW))
    session = appendPracticeEvent(session, { type: 'start-transfer', at: NOW + 10 })
    session = answer(session, [7, 20, 1, 3]); session = finishCheck(session)
    expect(practiceState(session).records[1].outcome).toBe('completed-after-retry')
  })

  it('refuses hints in checks and records help-seeking before selecting fresh items', () => {
    let session = finishCoach(createPractice('question-first', NOW))
    session = appendPracticeEvent(session, { type: 'start-transfer', at: NOW + 10 })
    expect(() => appendPracticeEvent(session, { type: 'hint', at: NOW + 11 })).toThrow(/independent/)
    session = appendPracticeEvent(session, { type: 'return-to-coach', at: NOW + 12 })
    expect(practiceState(session).records[1].outcome).toBe('needed-support')
    expect(taskFor(practiceState(session))?.id).toBe('C2')
    session = finishCoach(session)
    session = appendPracticeEvent(session, { type: 'start-transfer', at: NOW + 20 })
    expect(taskFor(practiceState(session))?.id).toBe('T2')
  })

  it('stops at the bounded sample limit without manufacturing a completed check', () => {
    let session = createPractice('question-first', NOW)
    for (let round = 0; round < 3; round++) {
      session = finishCoach(session)
      session = appendPracticeEvent(session, { type: 'start-transfer', at: practiceState(session).lastAt + 1 })
      session = appendPracticeEvent(session, { type: 'return-to-coach', at: practiceState(session).lastAt + 1 })
    }
    const state = practiceState(session)
    expect(state.sampleLimitReached).toBe(true)
    expect(state.records.filter(record => record.stage === 'transfer').every(record => record.outcome === 'needed-support')).toBe(true)
    expect(state.records.some(record => record.stage === 'review')).toBe(false)
  })

  it('preserves submitted steps across pause, resume, and local reload', () => {
    let session = answer(createPractice('question-first', NOW), [6])
    session = appendPracticeEvent(session, { type: 'pause', at: NOW + 2 })
    expect(() => answer(session, [60], NOW + 3)).toThrow(/Resume/)
    const restored = restorePractice(JSON.stringify(session), NOW + 100)
    expect(practiceState(restored).step).toBe(1)
    session = appendPracticeEvent(restored, { type: 'resume', at: NOW + 101 })
    expect(practiceState(answer(session, [60], NOW + 102)).step).toBe(2)
  })

  it('rejects stale submissions, invalid numbers, and backwards clocks', () => {
    const start = createPractice('question-first', NOW)
    const session = answer(start, [6])
    expect(() => appendPracticeEvent(session, { type: 'answer', taskId: 'C1', step: 0, values: [6], at: NOW + 2 })).toThrow(/earlier/)
    expect(() => answer(session, [60], NOW)).toThrow(/backwards/)
    expect(parsePracticeNumbers(['６', ' 20 '])).toEqual([6, 20])
    for (const value of ['', '1e2', '-1', '0.5', '10001', '<script>']) expect(() => parsePracticeNumbers([value])).toThrow()
  })

  it('replays stored answers and rejects forged outcomes, timestamps and oversized history', () => {
    const session = waitingSession()
    expect(restorePractice(JSON.stringify(session), NOW + 100)).toEqual(session)
    expect(() => restorePractice(JSON.stringify({ ...session, phase: 'complete' }), NOW + 100)).toThrow()
    expect(() => restorePractice(JSON.stringify(session), NOW - 1)).toThrow(/clock/)
    expect(() => restorePractice(JSON.stringify(session), NOW + PRACTICE_RETENTION_MS)).toThrow(/expired/)
    expect(() => restorePractice('x'.repeat(60001), NOW)).toThrow(/large/)
    const forged = { ...session, events: [{ type: 'start-review', at: NOW + REVIEW_DELAY_MS }] }
    expect(() => restorePractice(JSON.stringify(forged), NOW + REVIEW_DELAY_MS)).toThrow()
  })

  it('does not let a preview answer or export count as delayed completion', () => {
    const session = waitingSession(); const before = JSON.stringify(session)
    expect(() => appendPracticeEvent(session, { type: 'answer', taskId: 'PREVIEW-ONLY', step: 0, values: [5, 10, 5, 7], at: NOW + 100 })).toThrow()
    const report = practiceExport(session, NOW + 100)
    expect(report.phase).toBe('waiting')
    expect(report.records.some(record => record.stage === 'review')).toBe(false)
    expect(report.scope.delayedPreviewIncluded).toBe(false)
    expect(JSON.stringify(session)).toBe(before)
  })
})

describe('local-only preview boundaries', () => {
  it('handles unavailable storage without writing other app or account data', () => {
    const session = waitingSession()
    localStorage.setItem('unrelated-account-key', 'preserve')
    expect(savePractice(localStorage, session)).toBe('')
    expect(loadPractice(localStorage, NOW + 100).session).toEqual(session)
    expect(clearPractice(localStorage)).toBe('')
    expect(localStorage.getItem(PRACTICE_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('unrelated-account-key')).toBe('preserve')
    const denied = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('denied') } }
    expect(loadPractice(denied, NOW).session).toBeNull()
    expect(savePractice(denied, session)).toContain('无法保存')
    expect(clearPractice(denied)).toContain('未允许清除')
  })

  it('never sends practice errors into production telemetry', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network expected'))
    window.history.replaceState({}, '', '/practice')
    reportError('Synthetic practice failure')
    expect(fetch).not.toHaveBeenCalled()
  })
})
