import { describe, it, expect } from 'vitest'

// Replicate the computeLocalConfidence algorithm from knowledgeGraph.ts
// to verify the confidence formula independently
function computeLocalConfidence(mastery: number, struggle: number, encounters: number): number {
  if (encounters < 3) return 0.5
  const total = mastery + struggle
  if (total === 0) return 0.5
  const ratio = mastery / total
  const weight = Math.min(encounters / 10, 1.0)
  return parseFloat((0.5 + (ratio - 0.5) * weight).toFixed(3))
}

describe('computeLocalConfidence', () => {
  it('低于 3 次遇到一律返回 0.5', () => {
    expect(computeLocalConfidence(2, 0, 2)).toBe(0.5)
    expect(computeLocalConfidence(0, 1, 1)).toBe(0.5)
  })

  it('全部 mastery 信号 → 高置信度', () => {
    const result = computeLocalConfidence(5, 0, 5)
    expect(result).toBeGreaterThan(0.7)
  })

  it('全部 struggle 信号 → 低置信度', () => {
    const result = computeLocalConfidence(0, 5, 5)
    expect(result).toBeLessThan(0.3)
  })

  it('mastery 和 struggle 各半 → 接近 0.5', () => {
    const result = computeLocalConfidence(3, 3, 6)
    expect(result).toBe(0.5)
  })

  it('encounters 越多权重越大（收敛到真实比例）', () => {
    const low = computeLocalConfidence(3, 0, 3)
    const high = computeLocalConfidence(10, 0, 10)
    // 更多 encounters → 更接近 ratio (1.0) → 更高置信度
    expect(high).toBeGreaterThan(low)
  })

  it('encounters >= 10 时权重达到上限', () => {
    const at10 = computeLocalConfidence(8, 2, 10)
    const at20 = computeLocalConfidence(16, 4, 20)
    // weight caps at 1.0, so same ratio → same confidence
    expect(at10).toBe(at20)
  })

  it('零 mastery + 零 struggle（全 neutral）→ 0.5', () => {
    expect(computeLocalConfidence(0, 0, 5)).toBe(0.5)
  })

  it('结果精确到 3 位小数', () => {
    const result = computeLocalConfidence(2, 1, 3)
    const decimals = result.toString().split('.')[1]?.length ?? 0
    expect(decimals).toBeLessThanOrEqual(3)
  })
})
