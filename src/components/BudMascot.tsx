import { useId } from 'react'

type BudMascotEmotion = 'neutral' | 'happy' | 'thinking' | 'encouraging' | 'sad' | 'surprised' | 'curious' | 'sleepy' | 'focused'

interface BudMascotProps {
  animate?: 'idle' | 'wave'
  emotion?: BudMascotEmotion
  className?: string
  speechBubble?: string  // Per D-07, D-12: mascot-led guidance via speech bubble
}

const MOUTH_PATHS: Record<BudMascotEmotion, string> = {
  neutral:     'M 52 97 Q 60 105, 68 97',
  happy:       'M 48 95 Q 60 112, 72 95',
  thinking:    'M 52 100 Q 57 97, 62 100 Q 67 103, 72 100',
  encouraging: 'M 50 96 Q 60 104, 70 96',
  sad:         'M 52 102 Q 60 94, 68 102',
  surprised:   'M 52 96 Q 60 108, 68 96 Q 60 84, 52 96',
  curious:     'M 50 98 Q 55 95, 60 98 Q 65 101, 70 98',
  sleepy:      'M 54 100 Q 60 97, 66 100',
  focused:     'M 52 99 Q 60 96, 68 99',
}

export type { BudMascotEmotion }

/**
 * 小芽 Bud — ThinkBud 吉祥物
 * 椭圆绿身体 + 两片叶子 + 大眼睛 + 微笑 + 腮红
 * idle: 缓慢浮动呼吸 + 叶子微摆
 * wave: 右叶子大幅摆动 + 张嘴微笑
 */
export default function BudMascot({ animate = 'idle', emotion, className = '', speechBubble }: BudMascotProps) {
  const isWaving = animate === 'wave'
  const currentEmotion = emotion ?? 'neutral'
  const pupilRadius = currentEmotion === 'thinking' ? 4.0
    : currentEmotion === 'surprised' ? 5.5
    : currentEmotion === 'curious' ? 4.8
    : currentEmotion === 'sleepy' ? 3.5
    : currentEmotion === 'focused' ? 4.2
    : 4.5
  const cheekOpacity = currentEmotion === 'sad' ? 0.65
    : currentEmotion === 'thinking' ? 0.25
    : currentEmotion === 'surprised' ? 0.7
    : currentEmotion === 'curious' ? 0.4
    : currentEmotion === 'sleepy' ? 0.3
    : currentEmotion === 'focused' ? 0.35
    : 0.5
  const mouthPath = isWaving ? undefined : MOUTH_PATHS[currentEmotion]
  const mouthFill = currentEmotion === 'happy' ? 'rgba(31,41,55,0.08)'
    : currentEmotion === 'surprised' ? 'rgba(31,41,55,0.06)'
    : 'none'
  const isSleepy = currentEmotion === 'sleepy'
  const isSurprised = currentEmotion === 'surprised'
  const eyeWhiteRadius = isSurprised ? 8 : 7
  const uid = useId()
  const bodyGradId = `bud-body-${uid}`
  const leafGradId = `bud-leaf-${uid}`

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {speechBubble && (
        <div className="relative bg-[var(--color-bg-card)] border border-teal-100 rounded-2xl px-4 py-2.5 text-base text-[var(--color-text-primary)] shadow-sm w-max max-w-[220px] text-center mb-1 animate-fade-up">
          {speechBubble}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-teal-100" aria-hidden="true" />
        </div>
      )}
      <div className="bud-mascot-float">
        <svg
          viewBox="0 0 120 150"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            {/* 身体渐变 */}
            <linearGradient id={bodyGradId} x1="60" y1="40" x2="60" y2="130" gradientUnits="userSpaceOnUse">
              <stop stopColor="#34D399" />
              <stop offset="1" stopColor="#14B8A6" />
            </linearGradient>
            {/* 叶子渐变 */}
            <linearGradient id={leafGradId} x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#6EE7B7" />
              <stop offset="1" stopColor="#34D399" />
            </linearGradient>
          </defs>

          {/* 左叶子 */}
          <g className="bud-leaf-left">
            <ellipse
              cx="38" cy="38"
              rx="14" ry="8"
              fill={`url(#${leafGradId})`}
              transform="rotate(-35 38 38)"
            />
            {/* 叶脉 */}
            <line x1="32" y1="42" x2="42" y2="34" stroke="#A7F3D0" strokeWidth="1" strokeLinecap="round" />
          </g>

          {/* 右叶子 */}
          <g className={isWaving ? 'bud-leaf-wave' : 'bud-leaf-right'} style={{ transformOrigin: '78px 40px' }}>
            <ellipse
              cx="82" cy="38"
              rx="14" ry="8"
              fill={`url(#${leafGradId})`}
              transform="rotate(35 82 38)"
            />
            {/* 叶脉 */}
            <line x1="78" y1="34" x2="88" y2="42" stroke="#A7F3D0" strokeWidth="1" strokeLinecap="round" />
          </g>

          {/* 头顶小芽 */}
          <ellipse cx="60" cy="42" rx="5" ry="10" fill="#6EE7B7" />
          <ellipse cx="60" cy="34" rx="3" ry="5" fill="#A7F3D0" />

          {/* 身体 — 圆润椭圆 */}
          <ellipse
            cx="60" cy="90"
            rx="38" ry="42"
            fill={`url(#${bodyGradId})`}
          />

          {/* 身体高光 */}
          <ellipse
            cx="48" cy="78"
            rx="12" ry="16"
            fill="white"
            opacity="0.12"
          />

          {/* 左眼 */}
          {isSleepy ? (
            <>
              <path d="M 39 82 Q 46 78, 53 82" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="47" cy="79" r="1.5" fill="white" />
            </>
          ) : (
            <>
              <circle cx="46" cy="82" r={eyeWhiteRadius} fill="white" />
              <circle cx="47" cy="82" r={pupilRadius} fill="#1F2937" />
              <circle cx="49" cy="80" r="1.8" fill="white" />
            </>
          )}

          {/* 右眼 */}
          {isSleepy ? (
            <>
              <path d="M 67 82 Q 74 78, 81 82" stroke="#1F2937" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="75" cy="79" r="1.5" fill="white" />
            </>
          ) : (
            <>
              <circle cx="74" cy="82" r={eyeWhiteRadius} fill="white" />
              <circle cx="75" cy="82" r={pupilRadius} fill="#1F2937" />
              <circle cx="77" cy="80" r="1.8" fill="white" />
            </>
          )}

          {/* 腮红 */}
          <ellipse cx="38" cy="94" rx="6" ry="4" fill="#FCA5A5" opacity={cheekOpacity} />
          <ellipse cx="82" cy="94" rx="6" ry="4" fill="#FCA5A5" opacity={cheekOpacity} />

          {/* 嘴巴 */}
          {isWaving ? (
            // 张嘴微笑
            <path
              d="M 52 98 Q 60 108, 68 98"
              stroke="#1F2937"
              strokeWidth="2"
              strokeLinecap="round"
              fill="rgba(31,41,55,0.08)"
            />
          ) : (
            // 情绪表情弧线
            <path
              d={mouthPath}
              stroke="#1F2937"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill={mouthFill}
            />
          )}
        </svg>
      </div>
    </div>
  )
}
