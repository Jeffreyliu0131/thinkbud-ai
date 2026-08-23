import type { ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
}

interface ThinkingNode {
  label: string
  emotion?: string
  role: 'user' | 'assistant'
  content: string
}

function extractNodes(messages: ChatMessage[]): ThinkingNode[] {
  return messages
    .filter((m) => m.content.trim())
    .map((m) => ({
      label: m.thinkingNode || (m.role === 'user' ? '学生回答' : '教练引导'),
      emotion: m.emotion,
      role: m.role,
      content: m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content,
    }))
}

const EMOTION_DOTS: Record<string, string> = {
  '正常': 'bg-gray-400',
  '困惑': 'bg-amber-400',
  '沮丧': 'bg-rose-400',
  '兴奋': 'bg-emerald-400',
  '自信': 'bg-teal-400',
  '惊喜': 'bg-yellow-400',
  '好奇': 'bg-indigo-400',
  '困倦': 'bg-slate-400',
  '专注': 'bg-cyan-400',
}

export default function ThinkingTree({ messages }: Props) {
  const nodes = extractNodes(messages)

  if (nodes.length === 0) {
    return (
      <div className="text-center mt-20 animate-fade-up">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-teal-50 to-emerald-50 mb-4">
          <span className="text-4xl">🌳</span>
        </div>
        <p className="text-gray-600 text-sm">完成一次对话后，这里会显示你的思考链</p>
      </div>
    )
  }

  return (
    <div className="relative pl-6 max-w-lg mx-auto">
      {/* 竖线 — 暖灰渐变 */}
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-teal-200 via-gray-200 to-gray-100" />

      {nodes.map((node, i) => (
        <div
          key={i}
          className="relative mb-4 animate-fade-up"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          {/* 节点圆点 */}
          <div
            className={`absolute left-[-21px] top-1.5 w-3 h-3 rounded-full border-2 border-[#FFFBF5] shadow-sm ${
              node.role === 'user'
                ? 'bg-teal-500'
                : node.emotion
                  ? (EMOTION_DOTS[node.emotion] || 'bg-gray-400')
                  : 'bg-gray-400'
            }`}
          />

          {/* 节点内容 */}
          <div
            className={`rounded-2xl px-4 py-3 text-sm transition-all ${
              node.role === 'user'
                ? 'bg-gradient-to-br from-teal-50 to-emerald-50/50 border border-teal-100/80'
                : 'bg-white/80 backdrop-blur-sm border border-gray-100/80 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-medium text-xs text-gray-500">
                {node.role === 'user' ? '💭 学生' : '🧭 教练'}
              </span>
              <span className="text-xs text-teal-600 font-medium">
                {node.label}
              </span>
              {node.emotion && (
                <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">{node.emotion}</span>
              )}
            </div>
            <p className="text-gray-700 text-xs leading-relaxed">{node.content}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
