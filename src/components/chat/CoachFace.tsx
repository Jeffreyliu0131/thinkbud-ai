import type { EmotionType, InteractionPhase } from '../../types'

interface CoachFaceProps {
  phase: InteractionPhase
  emotion?: EmotionType
}

/**
 * 简笔 SVG 表情：两点眼睛 + 弧线嘴巴
 * 随 emotion / phase 变化呈现不同表情
 */
export default function CoachFace({ phase, emotion }: CoachFaceProps) {
  // 根据 emotion / phase 决定表情
  const isHappy = emotion === '兴奋' || emotion === '自信' || emotion === '惊喜'
  const isSad = emotion === '沮丧' || emotion === '困倦'
  const isConfused = emotion === '困惑' || emotion === '好奇'

  const isListening = phase === 'listening'
  const isProcessing = phase === 'processing'

  // 眼睛：普通圆点，processing 时变成 ··· 思考态
  const eyeRadius = isProcessing ? 2.5 : 3
  const eyeY = 38

  // 嘴巴路径
  let mouthPath: string
  if (isHappy) {
    // 大笑弧线
    mouthPath = 'M 32 52 Q 42 62, 52 52'
  } else if (isSad) {
    // 下弯弧线
    mouthPath = 'M 32 56 Q 42 48, 52 56'
  } else if (isConfused) {
    // 波浪线
    mouthPath = 'M 32 54 Q 37 50, 42 54 Q 47 58, 52 54'
  } else if (isListening) {
    // 张开的 O 形
    mouthPath = 'M 37 50 Q 37 58, 42 58 Q 47 58, 47 50 Q 47 46, 42 46 Q 37 46, 37 50'
  } else {
    // 微笑弧线
    mouthPath = 'M 34 52 Q 42 58, 50 52'
  }

  return (
    <svg
      viewBox="0 0 84 84"
      className="w-full h-full drop-shadow-sm"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 左眼 */}
      <circle
        cx="32" cy={eyeY} r={eyeRadius}
        fill="white"
        className={isProcessing ? 'animate-pulse' : ''}
      />
      {/* 左眼瞳孔高光 */}
      <circle cx="33.5" cy={eyeY - 1} r="1.2" fill="rgba(255,255,255,0.5)" />

      {/* 右眼 */}
      <circle
        cx="52" cy={eyeY} r={eyeRadius}
        fill="white"
        className={isProcessing ? 'animate-pulse' : ''}
      />
      {/* 右眼瞳孔高光 */}
      <circle cx="53.5" cy={eyeY - 1} r="1.2" fill="rgba(255,255,255,0.5)" />

      {/* 嘴巴 */}
      <path
        d={mouthPath}
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill={isListening ? 'rgba(255,255,255,0.2)' : 'none'}
      />
    </svg>
  )
}
