// GET /api/admin/conversations — 管理后台：对话列表
// 可选参数: ?userId=xxx 筛选特定用户
// GET /api/admin/conversations?id=xxx 获取单个对话的消息
import type { AppEnv } from '../../_shared/env'
import { getConversations, getMessages } from '../../_shared/db'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    const url = new URL(context.request.url)
    const conversationId = url.searchParams.get('id')
    const userId = url.searchParams.get('userId')

    // 如果指定了 id，返回该对话的消息列表
    if (conversationId) {
      const messages = await getMessages(context.env.DB, conversationId)
      return jsonResponse({ messages })
    }

    // 否则返回对话列表
    const conversations = await getConversations(context.env.DB, userId || undefined)
    return jsonResponse({ conversations })
  } catch (err) {
    console.error('[AdminConversations]', err)
    return errorResponse('获取对话列表失败')
  }
}
