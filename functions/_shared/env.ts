// 字节跳动/火山引擎体系环境变量类型定义
// 所有 API Key 仅在服务端使用，前端不暴露

import type { RagRuntimeEnv } from './rag/runtime'

export interface AppEnv extends VolcanoEnv, RagRuntimeEnv {
  // ===== D1 数据库 =====
  DB: D1Database

  // ===== Auth =====
  JWT_SECRET: string
  ADMIN_PASSWORD: string
  PHONE_HASH_SECRET: string // HMAC secret for phone number hashing (SEC-04)

  // ===== SMS（阿里云/腾讯云）=====
  SMS_ACCESS_KEY?: string
  SMS_SECRET?: string
  SMS_SIGN_NAME?: string // 短信签名，如 "ThinkBud"
  SMS_TEMPLATE_CODE?: string // 短信模板 ID

  // ===== Auth 模式 =====
  AUTH_MODE?: string // 'sms' | 'invite'，默认 'invite'
}

export interface VolcanoEnv {
  // ===== Chat: 火山方舟 =====
  ARK_API_KEY: string
  ARK_MODEL_ID: string // 方舟接入点 ID，如 ep-xxxxxxxx

  // ===== TTS: 豆包语音合成 =====
  TTS_APP_ID: string
  TTS_ACCESS_TOKEN: string
  TTS_CLUSTER: string // 如 volcano_tts
  TTS_VOICE_TYPE: string // 如 zh_female_tianmeixiaoyuan_moon_bigtts

  // ===== STT: 豆包语音识别 =====
  STT_APP_ID: string
  STT_ACCESS_TOKEN: string

  // ===== STT: 豆包语音识别（RTC Voice Agent 用） =====
  STT_CLUSTER?: string // 流式语音识别集群，默认 volcengine_streaming_common

  // ===== RTC: 火山引擎实时语音 =====
  RTC_APP_ID: string
  RTC_APP_KEY: string // 用于生成 Token（HMAC 密钥）

  // ===== OCR: 火山引擎 =====
  // 正式方案（火山 OCR）需要 AK/SK
  VOLC_ACCESS_KEY_ID: string
  VOLC_SECRET_ACCESS_KEY: string
  // 过渡方案（方舟视觉模型）复用 ARK_API_KEY + 视觉模型 ID
  ARK_VISION_MODEL_ID?: string
  // RTC 语音专用快速模型（可选，默认用 ARK_MODEL_ID）
  ARK_RTC_MODEL_ID?: string
}

/** 从 Cloudflare env 中安全读取变量 */
export function getEnvVar(
  env: object,
  key: string,
  required = true
): string {
  const value = (env as Record<string, unknown>)[key]
  if (required && !value) {
    throw new Error(`环境变量 ${key} 未配置`)
  }
  return (value as string) || ''
}

/** Middleware 注入到 context.data 的类型 */
export interface ContextData {
  [key: string]: unknown
  userId?: string
  isAdmin?: boolean
}
