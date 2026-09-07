// Deterministic adult-preview workflow. No model, account, BKT, or network dependency.
export const PRACTICE_VERSION = 'distributive-v1'
export const REVIEW_DELAY_MS = 24 * 60 * 60 * 1000
export const PRACTICE_RETENTION_MS = 7 * REVIEW_DELAY_MS
export const PRACTICE_STORAGE_KEY = 'thinkbud:adult-practice-preview:v1'
export type CoachingPolicy = 'question-first' | 'example-after-struggle'
export type PracticeStage = 'coach' | 'transfer' | 'review'
export type PracticePhase = PracticeStage | 'transfer-ready' | 'waiting' | 'complete'
export type PracticeTask = { id: string; a: number; b: number; c: number }

const TASKS: Record<PracticeStage, PracticeTask[]> = {
  coach: [{ id: 'C1', a: 6, b: 10, c: 4 }, { id: 'C2', a: 4, b: 20, c: 3 }, { id: 'C3', a: 8, b: 10, c: 6 }],
  transfer: [{ id: 'T1', a: 7, b: 20, c: 3 }, { id: 'T2', a: 9, b: 10, c: 6 }, { id: 'T3', a: 6, b: 30, c: 4 }],
  review: [{ id: 'R1', a: 8, b: 30, c: 2 }, { id: 'R2', a: 7, b: 40, c: 6 }, { id: 'R3', a: 9, b: 20, c: 7 }],
}
// Delayed-flow demonstration uses a different item and never touches a session.
export const REVIEW_PREVIEW_TASK: PracticeTask = { id: 'PREVIEW-ONLY', a: 5, b: 10, c: 7 }

type ControlEvent = { type: 'hint' | 'example' | 'start-transfer' | 'start-review' | 'return-to-coach' | 'pause' | 'resume'; at: number }
export type PracticeEvent = ControlEvent | {
  type: 'answer'; at: number; taskId: string; step: number; values: number[]
}
export type PracticeSession = {
  version: typeof PRACTICE_VERSION
  policy: CoachingPolicy
  startedAt: number
  events: PracticeEvent[]
}
export type PracticeRecord = {
  stage: PracticeStage; taskId: string; startedAt: number; finishedAt: number
  attempts: number; mistakes: number; hints: number; examples: number
  outcome: 'coached-completion' | 'first-attempt-without-hints' | 'completed-after-retry' | 'needed-support'
}
export type PracticeState = {
  phase: PracticePhase; round: number; step: number; paused: boolean; lastAt: number
  taskStartedAt: number; attempts: number; mistakes: number; stepMistakes: number
  hints: number; examples: number; help: 'none' | 'hint' | 'example'
  feedback: 'none' | 'try-again' | 'step-complete'
  reviewDueAt: number | null; records: PracticeRecord[]; sampleLimitReached: boolean
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function createPractice(policy: CoachingPolicy, now: number): PracticeSession {
  requireCondition(['question-first', 'example-after-struggle'].includes(policy) && Number.isFinite(now) && now >= 0, 'Invalid practice setup')
  return { version: PRACTICE_VERSION, policy, startedAt: now, events: [] }
}

export function taskFor(state: PracticeState): PracticeTask | null {
  if (!['coach', 'transfer', 'review'].includes(state.phase)) return null
  return TASKS[state.phase as PracticeStage][state.round] ?? null
}

export function gradeExpansion(task: PracticeTask, values: number[]): boolean {
  if (values.length !== 4) return false
  const pair = (a: number, b: number) => [a, b].sort((x, y) => x - y).join(':')
  const actual = [pair(values[0], values[1]), pair(values[2], values[3])].sort()
  const expected = [pair(task.a, task.b), pair(task.a, task.c)].sort()
  return actual.every((value, index) => value === expected[index])
}

export function gradeAnswer(task: PracticeTask, stage: PracticeStage, step: number, values: number[]): boolean {
  if (stage === 'coach') {
    const expected = [task.a, task.a * task.b, task.a * task.c, task.a * (task.b + task.c)]
    return values.length === 1 && step >= 0 && step < 4 && values[0] === expected[step]
  }
  return step === 0 ? gradeExpansion(task, values)
    : step === 1 && values.length === 1 && values[0] === task.a * (task.b + task.c)
}

export function practiceState(session: PracticeSession): PracticeState {
  requireCondition(session.version === PRACTICE_VERSION && ['question-first', 'example-after-struggle'].includes(session.policy), 'Unknown practice version or policy')
  requireCondition(Number.isFinite(session.startedAt) && session.startedAt >= 0 && session.events.length <= 160, 'Invalid practice history')
  const state: PracticeState = { phase: 'coach', round: 0, step: 0, paused: false, lastAt: session.startedAt,
    taskStartedAt: session.startedAt, attempts: 0, mistakes: 0, stepMistakes: 0, hints: 0, examples: 0,
    help: 'none', feedback: 'none', reviewDueAt: null, records: [], sampleLimitReached: false }
  const resetTask = (phase: PracticePhase, at: number) => {
    state.phase = phase; state.step = 0; state.taskStartedAt = at; state.attempts = 0
    state.mistakes = 0; state.stepMistakes = 0; state.hints = 0; state.examples = 0
    state.help = 'none'; state.feedback = 'none'
  }
  const finishTask = (at: number, support = false) => {
    const task = taskFor(state)
    requireCondition(task, 'No active task')
    state.records.push({ stage: state.phase as PracticeStage, taskId: task.id,
      startedAt: state.taskStartedAt, finishedAt: at, attempts: state.attempts, mistakes: state.mistakes,
      hints: state.hints, examples: state.examples,
      outcome: support ? 'needed-support' : state.phase === 'coach' ? 'coached-completion'
        : state.mistakes > 0 ? 'completed-after-retry' : 'first-attempt-without-hints' })
  }
  for (const event of session.events) {
    requireCondition(Number.isFinite(event.at) && event.at >= state.lastAt, 'Practice time must not move backwards')
    state.lastAt = event.at
    if (event.type === 'pause') {
      requireCondition(!state.paused && state.phase !== 'complete', 'Cannot pause here')
      state.paused = true; continue
    }
    if (event.type === 'resume') {
      requireCondition(state.paused, 'Practice is not paused')
      state.paused = false; continue
    }
    requireCondition(!state.paused, 'Resume before continuing')
    if (event.type === 'start-transfer') {
      requireCondition(state.phase === 'transfer-ready', 'Complete coaching before transfer')
      resetTask('transfer', event.at); continue
    }
    if (event.type === 'start-review') {
      requireCondition(state.phase === 'waiting' && state.reviewDueAt !== null && event.at >= state.reviewDueAt, 'The delayed check is not due yet')
      resetTask('review', event.at); continue
    }
    if (event.type === 'return-to-coach') {
      requireCondition(state.phase === 'transfer' || state.phase === 'review', 'Support return is only available during a check')
      finishTask(event.at, true); state.reviewDueAt = null
      if (state.round >= TASKS.coach.length - 1) {
        state.phase = 'complete'; state.sampleLimitReached = true
      } else { state.round += 1; resetTask('coach', event.at) }
      continue
    }
    const task = taskFor(state)
    requireCondition(task, 'There is no active question')
    if (event.type === 'hint' || event.type === 'example') {
      requireCondition(state.phase === 'coach', 'Hints cannot be mixed into an independent check')
      state.help = event.type
      if (event.type === 'hint') state.hints += 1
      else state.examples += 1
      continue
    }
    requireCondition(event.type === 'answer', 'Unknown practice event')
    requireCondition(event.taskId === task.id && event.step === state.step, 'This answer belongs to an earlier question')
    requireCondition(Array.isArray(event.values) && event.values.every(value => Number.isInteger(value) && value >= 0 && value <= 10000), 'Enter whole numbers only')
    const expectedCount = state.phase !== 'coach' && state.step === 0 ? 4 : 1
    requireCondition(event.values.length === expectedCount, 'Complete every field for this step')
    state.attempts += 1
    if (!gradeAnswer(task, state.phase as PracticeStage, state.step, event.values)) {
      state.mistakes += 1; state.stepMistakes += 1; state.feedback = 'try-again'
      if (state.phase === 'coach' && state.stepMistakes === 2) {
        if (session.policy === 'example-after-struggle' && state.help !== 'example') {
          state.help = 'example'; state.examples += 1
        } else if (session.policy === 'question-first' && state.help === 'none') {
          state.help = 'hint'; state.hints += 1
        }
      }
      continue
    }
    const lastStep = state.phase === 'coach' ? 3 : 1
    if (state.step < lastStep) {
      state.step += 1; state.stepMistakes = 0; state.help = 'none'; state.feedback = 'step-complete'
    } else {
      finishTask(event.at)
      if (state.phase === 'coach') state.phase = 'transfer-ready'
      else if (state.phase === 'transfer') { state.phase = 'waiting'; state.reviewDueAt = event.at + REVIEW_DELAY_MS }
      else state.phase = 'complete'
      state.feedback = 'none'; state.help = 'none'
    }
  }
  return state
}

export function parsePracticeNumbers(values: string[]): number[] {
  return values.map(raw => {
    const value = raw.normalize('NFKC').trim()
    requireCondition(/^\d{1,5}$/.test(value) && Number(value) <= 10000, '请填写 0 到 10000 之间的整数。')
    return Number(value)
  })
}

export function appendPracticeEvent(session: PracticeSession, event: PracticeEvent): PracticeSession {
  const next = { ...session, events: [...session.events, event] }
  practiceState(next)
  return next
}

export function restorePractice(raw: string, now: number): PracticeSession {
  requireCondition(raw.length <= 60000, 'Saved practice is too large')
  const input = JSON.parse(raw) as Record<string, unknown>
  requireCondition(input && typeof input === 'object' && Object.keys(input).every(key => ['version', 'policy', 'startedAt', 'events'].includes(key)), 'Invalid saved practice')
  requireCondition(input.version === PRACTICE_VERSION && typeof input.policy === 'string' && typeof input.startedAt === 'number' && Array.isArray(input.events), 'Invalid saved practice')
  const session = createPractice(input.policy as CoachingPolicy, input.startedAt)
  requireCondition(input.events.length <= 160, 'Saved practice exceeds the event limit')
  for (const rawEvent of input.events) {
    requireCondition(rawEvent && typeof rawEvent === 'object', 'Invalid saved event')
    const event = rawEvent as Record<string, unknown>
    const allowed = event.type === 'answer' ? ['type', 'at', 'taskId', 'step', 'values'] : ['type', 'at']
    requireCondition(Object.keys(event).every(key => allowed.includes(key)) && typeof event.at === 'number' && typeof event.type === 'string', 'Unexpected saved event fields')
    if (event.type === 'answer') requireCondition(typeof event.taskId === 'string' && typeof event.step === 'number' && Array.isArray(event.values), 'Invalid saved answer')
    session.events.push(event as PracticeEvent)
  }
  const state = practiceState(session)
  requireCondition(Number.isFinite(now) && state.lastAt <= now, 'Saved practice is ahead of the device clock')
  requireCondition(now - session.startedAt < PRACTICE_RETENTION_MS, 'Saved practice has expired')
  return session
}

export function practiceExport(session: PracticeSession, now: number) {
  const state = practiceState(session)
  return { format: 'thinkbud-adult-practice-observations-v1', exportedAt: now,
    scope: { adultPrototypeOnly: true, modelCalls: 0, learningImpactValidated: false,
      independentObserver: false, clock: 'device clock; not tamper-resistant', delayedPreviewIncluded: false },
    policy: session.policy, lessonVersion: session.version, phase: state.phase,
    records: state.records, pendingReviewAt: state.reviewDueAt,
    inProgress: taskFor(state) ? {
      stage: state.phase, taskId: taskFor(state)!.id, step: state.step,
      attempts: state.attempts, mistakes: state.mistakes, hints: state.hints, examples: state.examples,
      completed: false,
    } : null,
    // Deliberately omit raw numeric attempts; the local session may be cleared separately.
  }
}
