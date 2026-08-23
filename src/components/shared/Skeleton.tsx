interface SkeletonProps {
  className?: string
}

/** 基础骨架条 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-card)] ${className}`}
      style={{ background: 'linear-gradient(90deg, #F5EDE4 25%, #FFF8F0 50%, #F5EDE4 75%)', backgroundSize: '200% 100%' }}
      aria-hidden="true"
    />
  )
}

/** 历史记录卡片骨架 */
export function SkeletonCard() {
  return (
    <div
      className="bg-[var(--color-bg-card)] backdrop-blur-sm rounded-[var(--radius-card)] border border-[#E8DDD3] p-4 animate-pulse"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="h-5 w-16 bg-[#F5EDE4] rounded-full" />
        <div className="h-4 w-20 bg-[#F5EDE4] rounded" />
      </div>
      <div className="h-4 w-full bg-[#F5EDE4] rounded mb-2" />
      <div className="h-4 w-3/4 bg-[#F5EDE4] rounded mb-3" />
      <div className="flex gap-2">
        <div className="h-3 w-14 bg-[#F5EDE4] rounded-full" />
        <div className="h-3 w-14 bg-[#F5EDE4] rounded-full" />
      </div>
      <div className="flex gap-2 mt-3">
        <div className="flex-1 h-8 bg-[#F5EDE4] rounded-xl" />
        <div className="flex-1 h-8 bg-[#F5EDE4] rounded-xl" />
      </div>
    </div>
  )
}

/** 对话消息气泡骨架 */
export function SkeletonMessage({ isUser = false }: { isUser?: boolean }) {
  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-pulse`}
      aria-hidden="true"
    >
      <div
        className={`max-w-[85%] rounded-[var(--radius-card)] px-4 py-3 ${
          isUser
            ? 'bg-[var(--color-bg-card)]'
            : 'border border-[#E8DDD3]'
        }`}
      >
        <div className={`h-4 ${isUser ? 'w-24' : 'w-40'} bg-[#F5EDE4] rounded mb-2`} />
        <div className={`h-4 ${isUser ? 'w-32' : 'w-52'} bg-[#F5EDE4] rounded`} />
      </div>
    </div>
  )
}

/** 家长报告 Layer 1 骨架（吉祥物 + 文字 + 条形图） */
export function SkeletonReassurance() {
  return (
    <div className="animate-pulse bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-teal-100 p-4" aria-hidden="true">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-14 bg-[#F5EDE4] rounded-full shrink-0" />
        <div className="flex-1">
          <div className="h-6 w-3/4 bg-[#F5EDE4] rounded mb-2" />
          <div className="h-4 w-1/2 bg-[#F5EDE4] rounded" />
        </div>
      </div>
      <div className="flex items-end gap-1 h-10">
        {[16, 28, 8, 32, 20, 12, 24].map((h, i) => (
          <div key={i} className="flex-1 bg-[#F5EDE4] rounded-t" style={{ height: `${h}px` }} />
        ))}
      </div>
    </div>
  )
}

/** 家长报告手风琴骨架（3 个折叠头） */
export function SkeletonAccordion() {
  return (
    <div className="animate-pulse space-y-2 mt-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-12 bg-[#F5EDE4] rounded-[var(--radius-card)]"
        />
      ))}
    </div>
  )
}

/** 周报统计骨架 */
export function SkeletonStats() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      {/* Streak 卡 */}
      <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#F5EDE4] rounded-full" />
          <div>
            <div className="h-7 w-16 bg-[#F5EDE4] rounded mb-1" />
            <div className="h-3 w-28 bg-[#F5EDE4] rounded" />
          </div>
        </div>
      </div>
      {/* 概览 3 格 */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-3 text-center"
          >
            <div className="h-7 w-10 bg-[#F5EDE4] rounded mx-auto mb-1" />
            <div className="h-3 w-12 bg-[#F5EDE4] rounded mx-auto" />
          </div>
        ))}
      </div>
      {/* 活跃度条形图 */}
      <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] border border-[#E8DDD3] p-4">
        <div className="h-4 w-20 bg-[#F5EDE4] rounded mb-3" />
        <div className="flex items-end gap-1.5 h-20">
          {[28, 40, 12, 52, 20, 36, 8].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-[#F5EDE4] rounded-t-lg"
                style={{ height: `${h}px` }}
              />
              <div className="h-3 w-4 bg-[#F5EDE4] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
