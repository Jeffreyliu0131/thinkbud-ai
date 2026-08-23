import { useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { ChatMessage, GradeLevel } from '../types'
import ThinkingTree from '../components/ThinkingTree'

interface TreePageState {
  messages?: ChatMessage[]
  returnTo?: { resumeSessionId: string; gradeLevel: GradeLevel }
}

export default function ThinkingTreePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as TreePageState) || {}
  const messages = state.messages || []
  const returnTo = state.returnTo
  const mainRef = useRef<HTMLElement>(null)

  // 焦点管理
  useEffect(() => {
    mainRef.current?.focus()
  }, [])

  return (
    <div className="relative flex flex-col h-full bg-[#FFFBF5]">
      {/* 装饰背景 */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-16 -left-12 w-48 h-48 rounded-full bg-teal-200/[0.06] blur-3xl" />
        <div className="absolute bottom-1/3 -right-10 w-40 h-40 rounded-full bg-amber-200/[0.05] blur-3xl" />
        <div className="absolute bottom-16 left-1/4 w-32 h-32 rounded-full bg-emerald-200/[0.04] blur-2xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center px-4 py-3 shrink-0 md:px-8">
        <button
          onClick={() => {
            if (returnTo) {
              navigate('/chat', { state: returnTo })
            } else {
              navigate(-1)
            }
          }}
          aria-label="返回"
          className="text-gray-500 hover:text-teal-600 mr-3 text-xl transition-colors p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          ←
        </button>
        <h1 className="text-lg font-semibold text-gray-700">思考链看板</h1>
      </header>

      {/* 内容区 */}
      <main
        ref={mainRef}
        tabIndex={-1}
        className="relative z-10 flex-1 overflow-y-auto px-4 py-6 md:px-8 outline-none"
        aria-label="思考链看板"
      >
        <ThinkingTree messages={messages} />
      </main>
    </div>
  )
}
