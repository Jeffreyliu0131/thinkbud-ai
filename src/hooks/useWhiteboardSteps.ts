import { useMemo } from 'react'
import type { ChatMessage } from '../types'
import type { WhiteboardStep } from '../types/whiteboard'

/**
 * Extracts the latest whiteboard steps from chat messages.
 * Manages step status: the most recent AI message's steps are 'current',
 * earlier messages' steps are 'done'.
 * Filters out steps that may leak answers.
 */
export function useWhiteboardSteps(messages: ChatMessage[]): WhiteboardStep[] {
  return useMemo(() => {
    // Find the last assistant message with steps
    let latestSteps: WhiteboardStep[] | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].steps?.length) {
        latestSteps = messages[i].steps
        break
      }
    }

    if (!latestSteps || latestSteps.length === 0) return []

    // Filter out steps that leak answers
    const filtered = latestSteps.filter(s => !isAnswerLeak(s))

    // Assign status: first step is 'current', rest are 'upcoming'
    // (In a more advanced version, AI could mark which steps are done
    //  based on conversation progress. For MVP, keep it simple.)
    return filtered.map((step, i) => ({
      ...step,
      status: i === 0 ? 'current' as const : 'upcoming' as const,
    }))
  }, [messages])
}

/**
 * Check if a step's math field leaks a bare answer.
 * Must NOT match equation setups like "3x + 6 = 9" (has operators before =).
 * Must match: "x = 3", "= 15" (bare variable = number).
 */
function isAnswerLeak(step: WhiteboardStep): boolean {
  if (!step.math) {
    // Label-only check for answer-revealing words
    return !!step.label && /^(答案|结果|得|最终)/.test(step.label)
  }
  const trimmed = step.math.trim()
  // "x = 3" pattern: single variable = number (bare answer)
  if (/^[a-zA-Z]\s*=\s*-?\d+(\.\d+)?\s*$/.test(trimmed)) return true
  // "= 15" pattern: just equals number with no left side
  if (/^\s*=\s*-?\d+(\.\d+)?\s*$/.test(trimmed)) return true
  // Check label for answer-revealing keywords
  if (step.label && /^(答案|结果|得|最终)/.test(step.label)) return true
  return false
}
