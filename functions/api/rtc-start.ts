// Cloudflare Pages Function: 启动 RTC Voice Chat 会话
// 调用火山引擎 StartVoiceChat API，创建 AI 语音对话任务
// POST { roomId, userId, taskId, gradeLevel, subject?, session? } → { success }
// System Prompt 在服务端构建，前端不接触 prompt 内容
//
// VOICE-01 研究结论 (2026-03-24):
// S2SConfig: 未测试 — 火山引擎 RTC Voice Agent 当前 API (2024-12-01) 文档
// 仅描述 ASR+LLM+TTS 三段式配置，S2S 端到端模式在公开文档中无使用示例。
// 当前方案: ASR→LLM→TTS 参数优化（seedasr 2.0 大模型、AIVAD、Prefill、降低 MaxTokens）

import { signRequest } from '../_shared/providers/rtc/sign'
import { jsonResponse, errorResponse } from '../_shared/utils/response'
import { getEnvVar } from '../_shared/env'
import { buildRTCSystemPrompt } from '../_shared/prompt'
import type { GradeLevel, Subject, SessionContext } from '../_shared/prompt'
import type { AppEnv, ContextData } from '../_shared/env'
import { startUsageSession } from '../_shared/usage-time'
import { checkUserRateLimit } from '../_shared/rate-limit'

const RTC_API_HOST = 'https://rtc.volcengineapi.com'
const ACTION = 'StartVoiceChat'
const VERSION = '2024-12-01'

const VALID_GRADE_LEVELS: ReadonlySet<string> = new Set(['lower', 'upper'])
const VALID_SUBJECTS: ReadonlySet<string> = new Set(['math', 'chinese', 'english'])
const MAX_LEARNER_CONTEXT_LENGTH = 2000

export const onRequestPost: PagesFunction<AppEnv, string, ContextData> = async (context) => {
  try {
    const { roomId, userId, taskId, gradeLevel, subject, session, learnerContext } = await context.request.json() as {
      roomId?: string
      userId?: string
      taskId?: string
      gradeLevel?: GradeLevel
      subject?: Subject
      session?: SessionContext
      learnerContext?: string
    }

    if (!roomId || !userId || !taskId || !gradeLevel) {
      return errorResponse('缺少必要参数', 400)
    }

    // 白名单校验 gradeLevel 和 subject（信任边界）
    if (!VALID_GRADE_LEVELS.has(gradeLevel)) {
      return errorResponse('无效的 gradeLevel 参数', 400)
    }
    if (subject !== undefined && !VALID_SUBJECTS.has(subject)) {
      return errorResponse('无效的 subject 参数', 400)
    }

    // 校验 learnerContext：必须是字符串且不超过长度限制
    let sanitizedLearnerContext: string | undefined
    if (learnerContext !== undefined) {
      if (typeof learnerContext !== 'string') {
        return errorResponse('learnerContext 必须是字符串', 400)
      }
      if (learnerContext.length > MAX_LEARNER_CONTEXT_LENGTH) {
        sanitizedLearnerContext = learnerContext.slice(0, MAX_LEARNER_CONTEXT_LENGTH)
      } else {
        sanitizedLearnerContext = learnerContext
      }
    }

    // 服务端构建 system prompt（防止前端绕过产品宪法）
    const systemPrompt = buildRTCSystemPrompt(gradeLevel, { subject, session, learnerContext: sanitizedLearnerContext })

    // VOI-03: TTS 语速按学段分化
    const speechRate = gradeLevel === 'lower' ? -0.1 : 0

    // STAB-05: per-user 限流（每分钟 5 次 rtc-start）
    const authUserId = context.data?.userId
    const db = context.env.DB
    if (authUserId && db) {
      const rateCheck = await checkUserRateLimit(db, authUserId, 'rtc-start', 5, 1)
      if (!rateCheck.allowed) {
        return errorResponse('请求过于频繁，请稍后再试', 429)
      }
    }

    // COMP-01: 使用时长跟踪（限制暂停——测试阶段无需限流，上线后按订阅等级重新设计）
    if (authUserId && db) {
      // 仍然记录会话，但不拒绝请求
      context.waitUntil(
        startUsageSession(db, authUserId, 'rtc').catch(e => console.warn('[RTC] 使用时长记录失败:', e))
      )
    }

    const env = context.env
    const rtcAppId = getEnvVar(env, 'RTC_APP_ID')
    const accessKeyId = getEnvVar(env, 'VOLC_ACCESS_KEY_ID')
    const secretAccessKey = getEnvVar(env, 'VOLC_SECRET_ACCESS_KEY')

    // TTS 配置（语音合成大模型，使用 volcano_bidirection provider）
    const ttsAppId = getEnvVar(env, 'TTS_APP_ID')
    const ttsAccessToken = getEnvVar(env, 'TTS_ACCESS_TOKEN')
    const ttsVoiceType = getEnvVar(env, 'TTS_VOICE_TYPE')

    // STT 配置（流式语音识别大模型）
    const sttAppId = getEnvVar(env, 'STT_APP_ID')
    const sttAccessToken = getEnvVar(env, 'STT_ACCESS_TOKEN')

    // ArkV3 内置 LLM（火山内部直调，无需回调外部服务器）
    const arkModelId = getEnvVar(env, 'ARK_MODEL_ID')

    const botUserId = `bot_${taskId}`

    const body = JSON.stringify({
      AppId: rtcAppId,
      RoomId: roomId,
      TaskId: taskId,
      AgentConfig: {
        UserId: botUserId,
        TargetUserId: [userId],
        WelcomeMessage: '',
        EnableConversationStateCallback: false,
        AnsMode: 2,
      },
      Config: {
        ASRConfig: {
          Provider: 'volcano',
          ProviderParams: {
            AppId: sttAppId,
            AccessToken: sttAccessToken,
            Mode: 'bigmodel',
            ApiResourceId: 'volc.seedasr.sauc.duration',
            StreamMode: 2,
          },
          VADConfig: {
            SilenceTime: 600,   // 实验值：降低至600ms加速轮次检测（远端默认 silenceTime 按年级动态）
            AIVAD: true,
          },
          InterruptConfig: {
            InterruptSpeechDuration: 200,   // 降低：700ms→200ms（API最小值），中文单音节回复"好/对/嗯"约200-400ms，700ms导致短回复被丢弃
          },
        },
        TTSConfig: {
          Provider: 'volcano_bidirection',
          ProviderParams: {
            app: {
              appid: ttsAppId,
              token: ttsAccessToken,
            },
            audio: {
              voice_type: ttsVoiceType,
              speech_rate: speechRate,   // VOI-03: 低年级 -0.1 / 高年级 0
            },
            ResourceId: 'volc.service_type.10029',
          },
        },
        LLMConfig: {
          Mode: 'ArkV3',
          EndPointId: arkModelId,
          SystemMessages: [systemPrompt],
          Temperature: 0.7,
          MaxTokens: 1024,
          HistoryLength: 20,
          Prefill: true,
          ReasoningEffort: 'minimal',        // 关闭思考，直接回答（doubao-seed-2.0-lite 支持）
          Thinking: { Type: 'disabled' },    // 双保险：强制关闭深度思考
        },
        SubtitleConfig: {
          SubtitleMode: 1,
        },
      },
    })

    const url = `${RTC_API_HOST}?Action=${ACTION}&Version=${VERSION}`

    const headers = await signRequest({
      method: 'POST',
      url,
      body,
      accessKeyId,
      secretAccessKey,
      service: 'rtc',
      region: 'cn-north-1',
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const result = await res.json() as {
      ResponseMetadata?: { Error?: { Code: string; Message: string } }
      Result?: unknown
    }

    if (!res.ok || result.ResponseMetadata?.Error) {
      const errCode = result.ResponseMetadata?.Error?.Code || ''
      const errMsg = result.ResponseMetadata?.Error?.Message || `HTTP ${res.status}`
      console.error('[RTC Start] API error:', { errCode, errMsg, result: JSON.stringify(result) })
      throw new Error(`StartVoiceChat 失败: ${errCode} - ${errMsg}`)
    }

    console.log('[RTC Start] 成功', { roomId, taskId, botUserId, result: JSON.stringify(result) })
    return jsonResponse({ success: true, botUserId })
  } catch (err) {
    const message = err instanceof Error ? err.message : '启动语音对话失败'
    console.error('[RTC Start]', message)
    return errorResponse(message)
  }
}
