// Session Assessment Engine
// Pure computation of session assessment from D1 conversation data.
// Zero LLM calls — all metrics derived from conversation analytics fields.

export type IndependenceLevel = 'independent' | 'guided' | 'heavily_guided' | 'struggling'

export interface SessionAssessment {
  independenceLevel: IndependenceLevel
  guidanceEfficiency: number    // hint_count / message_count ratio
  hintCount: number
  messageCount: number
  durationSeconds: number | null
  resolutionType: string | null
  struggleDurationMs: number | null
}

/**
 * Compute session assessment from conversation analytics.
 *
 * Independence thresholds (locked):
 * - <=2 hints → independent
 * - 3-5 hints → guided
 * - 6-10 hints → heavily_guided
 * - >10 hints OR unresolved → struggling
 */
export function computeAssessment(conv: {
  hint_count: number | null
  message_count: number
  resolution_type: string | null
  duration_seconds: number | null
  struggle_duration_ms: number | null
}): SessionAssessment {
  const hintCount = conv.hint_count ?? 0
  const messageCount = Math.max(conv.message_count, 1)

  let independenceLevel: IndependenceLevel
  if (conv.resolution_type === 'unresolved' || hintCount > 10) {
    independenceLevel = 'struggling'
  } else if (hintCount > 5) {
    independenceLevel = 'heavily_guided'
  } else if (hintCount > 2) {
    independenceLevel = 'guided'
  } else {
    independenceLevel = 'independent'
  }

  return {
    independenceLevel,
    guidanceEfficiency: hintCount / messageCount,
    hintCount,
    messageCount,
    durationSeconds: conv.duration_seconds,
    resolutionType: conv.resolution_type,
    struggleDurationMs: conv.struggle_duration_ms,
  }
}
