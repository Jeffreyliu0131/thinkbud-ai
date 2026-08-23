import type { GradeLevel } from './types'
import { getGradeAdapter } from './grade-adapters'
import type { GradeAdapter } from './grade-adapters'
import { buildCorePrompt, buildSilenceHandlingPrompt, buildMetaFormatPrompt } from './core'
import { buildMathPrompt } from './subjects/math'
import { buildChinesePrompt } from './subjects/chinese'
import { buildEnglishPrompt } from './subjects/english'
import { buildSessionBlock } from './session-manager'
import type { Subject, SessionContext } from './session-manager'

export type { GradeLevel }
export type { Subject, SessionContext }
export type { ProblemInfo } from './session-manager'

interface PromptOptions {
  subject?: Subject
  session?: SessionContext
  learnerContext?: string
  enableWhiteboard?: boolean
}

type SubjectBuilder = (adapter: GradeAdapter) => string

const SUBJECT_BUILDERS: Record<Subject, SubjectBuilder> = {
  math: buildMathPrompt,
  chinese: buildChinesePrompt,
  english: buildEnglishPrompt,
}

/**
 * 构建文本/STT 对话的 system prompt
 * 包含 META 输出格式要求
 */
export function buildSystemPrompt(
  gradeLevel: GradeLevel,
  options?: PromptOptions,
): string {
  const subject = options?.subject ?? 'math'
  const adapter = getGradeAdapter(gradeLevel)
  const subjectBuilder = SUBJECT_BUILDERS[subject] ?? buildMathPrompt

  let prompt = buildCorePrompt(adapter)
  prompt += subjectBuilder(adapter)
  prompt += buildSessionBlock(options?.session)
  if (options?.learnerContext) {
    prompt += '\n\n' + options.learnerContext
  }
  prompt += buildMetaFormatPrompt(options?.enableWhiteboard)

  return prompt
}

/**
 * 构建 RTC 实时语音对话的 system prompt
 * 无 META 格式（TTS 会读出来），包含沉默处理
 */
export function buildRTCSystemPrompt(
  gradeLevel: GradeLevel,
  options?: PromptOptions,
): string {
  const subject = options?.subject ?? 'math'
  const adapter = getGradeAdapter(gradeLevel)
  const subjectBuilder = SUBJECT_BUILDERS[subject] ?? buildMathPrompt

  let prompt = buildCorePrompt(adapter)
  prompt += subjectBuilder(adapter)
  prompt += buildSessionBlock(options?.session)
  if (options?.learnerContext) {
    prompt += '\n\n' + options.learnerContext
  }
  prompt += buildSilenceHandlingPrompt()
  prompt += `

## 语音输出规则
- 只输出纯对话文本，不加任何标记、标签、JSON、格式符号
- 回复要简短自然，适合语音朗读`

  return prompt
}
