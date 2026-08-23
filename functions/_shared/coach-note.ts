// Coach Note Generation Module (Phase 15 -- PARENT-01)
// Generates warm, parent-friendly AI coach notes from conversation messages.
// Uses chatCompletionJSON for structured JSON output.

import { chatCompletionJSON } from './providers/chat/ark'
import type { CoachNote } from '../../src/types/parent'

/** Build system prompt for coach note generation */
export function buildCoachNotePrompt(subject: string): string {
  const subjectLabel = subject === 'math' ? '\u6570\u5b66'
    : subject === 'chinese' ? '\u8bed\u6587' : '\u82f1\u8bed'
  return `\u4f60\u662f\u4e00\u4f4d\u6e29\u6696\u7684\u5b66\u4e60\u6559\u7ec3\uff0c\u6b63\u5728\u7ed9\u5bb6\u957f\u5199\u4eca\u5929\u7684\u8f85\u5bfc\u7b14\u8bb0\u3002
\u8bf7\u7528\u7b80\u6d01\u6e29\u6696\u7684\u53e3\u543b\uff0c\u4ee5\u5bb6\u957f\u80fd\u7406\u89e3\u7684\u65b9\u5f0f\u63cf\u8ff0\u5b69\u5b50\u4eca\u5929\u7684\u5b66\u4e60\u60c5\u51b5\u3002

\u3010\u89c4\u5219\u3011
1. \u8bed\u6c14\u50cf\u4e00\u4e2a\u5173\u5fc3\u5b69\u5b50\u7684\u8001\u5e08\u5728\u5fae\u4fe1\u4e0a\u548c\u5bb6\u957f\u804a\u5929
2. \u7a81\u51fa\u5b69\u5b50\u7684\u52aa\u529b\u548c\u8fdb\u6b65\uff0c\u5f31\u5316\u56f0\u96be
3. \u5982\u679c\u6709\u7cbe\u5f69\u7684\u601d\u8003\u77ac\u95f4\uff0c\u7528\u539f\u8bdd\u5f15\u7528
4. \u53ea\u8fd4\u56de JSON\uff0c\u4e0d\u8981\u4efb\u4f55\u89e3\u91ca

\u3010\u8f93\u51fa\u683c\u5f0f\u3011
{
  "topic": "\u4eca\u5929\u7ec3\u4e60\u7684\u4e3b\u9898\uff0c\u5982\uff1a\u8fdb\u4f4d\u52a0\u6cd5",
  "stuck_at": "\u5361\u4f4f\u7684\u5730\u65b9\uff08\u6ca1\u6709\u5219\u4e3anull\uff09",
  "strategies": ["\u4f7f\u7528\u7684\u7b56\u7565\u5217\u8868"],
  "highlight_quote": "\u5b69\u5b50\u8bf4\u7684\u6700\u7cbe\u5f69\u7684\u4e00\u53e5\u8bdd\uff08\u6ca1\u6709\u5219\u4e3anull\uff09",
  "summary": "\u4e00\u53e5\u8bdd\u603b\u7ed3\uff0c\u6e29\u6696\u53e3\u543b\uff0c\u5982\uff1a\u4eca\u5929\u5c0f\u670b\u53cb\u5728\u7ec3\u4e60\u8fdb\u4f4d\u52a0\u6cd5\uff0c\u901a\u8fc7\u51d1\u5341\u6cd5\u81ea\u5df1\u60f3\u901a\u4e86\uff01"
}

\u5b66\u79d1\uff1a${subjectLabel}`
}

/** Parse coach note JSON from LLM output, returning null on failure */
export function parseCoachNote(raw: string): CoachNote | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>

    // Validate required fields
    if (typeof parsed.topic !== 'string' || !parsed.topic) return null
    if (typeof parsed.summary !== 'string' || !parsed.summary) return null
    if (!Array.isArray(parsed.strategies)) return null

    return {
      topic: parsed.topic,
      stuck_at: typeof parsed.stuck_at === 'string' ? parsed.stuck_at : null,
      strategies: parsed.strategies.filter((s): s is string => typeof s === 'string'),
      highlight_quote: typeof parsed.highlight_quote === 'string' ? parsed.highlight_quote : null,
      summary: parsed.summary,
    }
  } catch {
    return null
  }
}

/** Generate a coach note from conversation messages. Returns null on any failure (never throws). */
export async function generateCoachNote(
  env: Record<string, string | undefined>,
  messages: Array<{ role: string; content: string }>,
  subject: string
): Promise<CoachNote | null> {
  try {
    const conversationText = messages
      .map(m => `${m.role === 'user' ? '\u5b69\u5b50' : 'AI\u6559\u7ec3'}: ${m.content}`)
      .join('\n')

    const systemPrompt = buildCoachNotePrompt(subject)
    const userMessage = `\u8bf7\u5206\u6790\u4ee5\u4e0b\u8f85\u5bfc\u5bf9\u8bdd\uff0c\u5199\u4e00\u4efd\u5bb6\u957f\u7b14\u8bb0\uff1a\n\n${conversationText}`

    const rawResult = await chatCompletionJSON(env, {
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
    })

    return parseCoachNote(rawResult)
  } catch {
    return null
  }
}
