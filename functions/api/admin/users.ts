// GET /api/admin/users — 管理后台：用户列表
import type { AppEnv } from '../../_shared/env'
import { getAllUsers } from '../../_shared/db'
import { jsonResponse, errorResponse } from '../../_shared/utils/response'

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    const users = await getAllUsers(context.env.DB)
    return jsonResponse({ users })
  } catch (err) {
    console.error('[AdminUsers]', err)
    return errorResponse('获取用户列表失败')
  }
}
