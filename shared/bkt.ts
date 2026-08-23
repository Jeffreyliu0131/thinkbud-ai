// Bayesian Knowledge Tracing (Corbett & Anderson 1995)
// Pure function module — shared between client (IndexedDB) and server (D1)

export interface BKTParams {
  pL0: number  // Initial P(L) = 0.5
  pT: number   // Learning transition = 0.1
  pG: number   // Guess probability = 0.2
  pS: number   // Slip probability = 0.1
}

export const DEFAULT_BKT_PARAMS: BKTParams = {
  pL0: 0.5, pT: 0.1, pG: 0.2, pS: 0.1,
}

// Clamp range — prevents stuck states (Pitfall 1 from research)
const MIN_CONFIDENCE = 0.05
const MAX_CONFIDENCE = 0.95

/**
 * Compute posterior P(L) given prior and observed response.
 *
 * @param prior  Current P(L) before this observation
 * @param isCorrect  true = mastery signal, false = struggle signal
 * @param params  BKT parameters (default: standard Corbett & Anderson values)
 * @returns Updated P(L) clamped to [0.05, 0.95]
 */
export function updateBKT(
  prior: number,
  isCorrect: boolean,
  params: BKTParams = DEFAULT_BKT_PARAMS,
): number {
  const { pS, pG, pT } = params

  // Step 1: Bayesian posterior update
  let posterior: number
  if (isCorrect) {
    // P(L|correct) = P(correct|L)*P(L) / P(correct)
    const num = prior * (1 - pS)
    const denom = num + (1 - prior) * pG
    posterior = denom > 0 ? num / denom : prior
  } else {
    // P(L|incorrect) = P(incorrect|L)*P(L) / P(incorrect)
    const num = prior * pS
    const denom = num + (1 - prior) * (1 - pG)
    posterior = denom > 0 ? num / denom : prior
  }

  // Step 2: Learning transition
  const updated = posterior + (1 - posterior) * pT

  // Step 3: Clamp to [0.05, 0.95] to prevent stuck states
  return Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, updated))
}
