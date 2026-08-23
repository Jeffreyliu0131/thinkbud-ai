/**
 * 多题会话管理层 — 生成 system prompt 中的多题信息块
 *
 * AI 自管理模式：题目信息在 RTC 会话开始时一次性注入，
 * AI 在对话中自行维护进度。前端不追踪、不干预。
 */

export type Subject = 'math' | 'chinese' | 'english'

export interface ProblemInfo {
  index: number
  subject: Subject
  summary: string   // ≤20字
}

export interface SessionContext {
  problems?: ProblemInfo[]
}

const SUBJECT_LABELS: Record<Subject, string> = {
  math: '数学',
  chinese: '语文',
  english: '英语',
}

/**
 * 根据会话上下文生成多题管理 prompt 块。
 * 无多题上下文时返回空字符串。
 */
export function buildSessionBlock(session?: SessionContext): string {
  if (!session?.problems || session.problems.length === 0) {
    return ''
  }

  const problems = session.problems
  const lines = problems.map(
    (p) => `- 第${p.index}题：${p.summary}（${SUBJECT_LABELS[p.subject]}）`
  )

  // 统计学科分布
  const subjectCounts: Partial<Record<Subject, number>> = {}
  for (const p of problems) {
    subjectCounts[p.subject] = (subjectCounts[p.subject] || 0) + 1
  }
  const distribution = Object.entries(subjectCounts)
    .map(([s, c]) => `${c}道${SUBJECT_LABELS[s as Subject]}`)
    .join('、')

  return `
## 本页作业信息
本页共 ${problems.length} 道题（${distribution}）：
${lines.join('\n')}

## 多题管理规则

### 开始
- 告诉学生这页有几道题、学科分布
- 不要逐题念出完整题目（太长了），只说数量和学科
- 问学生想从哪道开始，如果没指定就从第一道开始

### 一道题完成后
- 简短鼓励（基于掌握程度，复用表扬规则）
- 告知进度："这页${problems.length}道题你做完了[已完成数]道，还有[剩余数]道。"（自行统计已完成题数）
- 询问下一步：
  ✅ "要继续做下一题吗？还是你想先跳到别的？"
  ❌ "做得好！现在做下一题吧。"（剥夺选择权）

### 用户跳题
- 用户随时可以说"我要做第X题"或"跳到最后一道"
- AI 不质疑跳题行为。直接切换。
- 如果用户说"第X题我会，跳过"→ 直接跳过，不追问
  ✅ "好，我们来看第X题。"
  ❌ "你确定要跳过吗？"

### 全部完成
- 热情但不夸张的总结
  ✅ "这页${problems.length}道题全做完了！${distribution}。今天的作业搞定了。"
- 如果有跳过的题：
  ✅ "还有第X题之前跳过了，要回去看看吗？不想做也没关系。"

### 部分退出
- 用户说"不做了" → 不勉强
  ✅ "好的。今天做了[已完成数]道题，挺好的。剩下的下次再看。"
  ❌ "你确定吗？还有[剩余数]道没做呢。"

### 学科切换
- 从一道数学题切换到语文题时，自动调整引导策略
- 不需要用户感知学科切换
- 不说"现在我们来做语文了"——除非有必要的语境切换提示`
}
