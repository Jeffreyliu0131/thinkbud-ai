import { useState, useEffect } from 'react'
import { fetchWithTimeout } from '../lib/api'

type Tab = 'users' | 'conversations' | 'stats' | 'errors'

interface User {
  id: string
  phone: string
  nickname: string | null
  grade: number | null
  onboarding_completed: number
  created_at: string
  last_active_at: string | null
}

interface Conversation {
  id: string
  user_id: string
  subject: string | null
  started_at: string
  ended_at: string | null
  message_count: number
  duration_seconds: number | null
  audit_flags: string | null
  resolution_type: string | null
  ocr_text: string | null
  strategies_used: string | null
  hint_count: number | null
  nickname?: string
  grade?: number
}

interface Message {
  id: string
  role: string
  content: string
  input_method: string | null
  emotion: string | null
  session_phase: string | null
  compliance_issues: string | null
  created_at: string
}

interface Stats {
  totalUsers: number
  activeToday: number
  totalConversations: number
  avgDuration: number | null
  resolutionBreakdown: Array<{ resolution_type: string; cnt: number }>
  subjectBreakdown: Array<{ subject: string; cnt: number }>
  complianceIssueCount: number
}

interface ErrorLog {
  id: number
  source: string
  path: string | null
  message: string
  stack: string | null
  meta: string | null
  user_id: string | null
  created_at: string
}

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<User[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [expandedErrorId, setExpandedErrorId] = useState<number | null>(null)
  const [filterUserId, setFilterUserId] = useState<string | null>(null)

  const adminFetch = async (url: string) => {
    const res = await fetchWithTimeout(url, { timeout: 10000 })
    if (res.status === 401) {
      setIsLoggedIn(false)
      throw new Error('请重新登录')
    }
    if (!res.ok) throw new Error('请求失败')
    return res.json()
  }

  const handleLogin = async () => {
    setIsLoading(true)
    setLoginError('')
    try {
      const res = await fetchWithTimeout('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        timeout: 10000,
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setLoginError(data.error || '登录失败')
        return
      }
      setIsLoggedIn(true)
      setPassword('')
    } catch {
      setLoginError('网络错误')
    } finally {
      setIsLoading(false)
    }
  }

  // 加载数据
  useEffect(() => {
    if (!isLoggedIn) return
    if (tab === 'users') {
      adminFetch('/api/admin/users').then((d: { users: User[] }) => setUsers(d.users)).catch(() => {})
    } else if (tab === 'conversations') {
      const url = filterUserId ? `/api/admin/conversations?userId=${filterUserId}` : '/api/admin/conversations'
      adminFetch(url).then((d: { conversations: Conversation[] }) => setConversations(d.conversations)).catch(() => {})
    } else if (tab === 'stats') {
      adminFetch('/api/admin/stats').then((d: { stats: Stats }) => setStats(d.stats)).catch(() => {})
    } else if (tab === 'errors') {
      adminFetch('/api/admin/errors').then((d: ErrorLog[]) => setErrors(d)).catch(() => {})
    }
  }, [isLoggedIn, tab, filterUserId])

  // 查看对话消息
  const viewConversation = async (id: string) => {
    setSelectedConversation(id)
    try {
      const data = await adminFetch(`/api/admin/conversations?id=${id}`) as { messages: Message[] }
      setMessages(data.messages)
    } catch { /* handled */ }
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso + 'Z')
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  // 登录页面
  if (!isLoggedIn) {
    return (
      <main className="flex items-start justify-center h-full bg-[var(--color-bg-primary)] px-6 pt-[25vh]">
        <div className="w-full max-w-xs space-y-4">
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] text-center">ThinkBud Admin</h1>
          <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 border border-[#E8DDD3] shadow-sm">
            <input
              type="password"
              placeholder="管理密码"
              aria-label="管理密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full px-4 py-3 rounded-[var(--radius-input)] border border-[#E8DDD3] text-base text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] focus:outline-none focus:ring-2 focus:ring-teal-400 min-h-[var(--touch-min)]"
              autoFocus
            />
            {loginError && <p className="text-sm text-rose-500 text-center mt-3">{loginError}</p>}
            <button
              onClick={handleLogin}
              disabled={isLoading || !password}
              className={`w-full mt-4 py-3 font-semibold transition-all ${
                password ? 'bg-teal-500 text-white hover:bg-teal-600 btn-3d btn-3d-teal' : 'bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]'
              } rounded-[var(--radius-pill)] min-h-[var(--touch-min)]`}
            >
              {isLoading ? '验证中...' : '登录'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  // 管理面板
  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
      {/* 顶栏 */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#E8DDD3] bg-[var(--color-bg-card)]">
        <h1 className="text-lg font-bold text-[var(--color-text-primary)]">ThinkBud Admin</h1>
        <button onClick={() => setIsLoggedIn(false)} className="text-sm text-[var(--color-text-muted)] hover:text-rose-500 min-h-[var(--touch-min)] flex items-center" aria-label="登出管理后台">
          登出
        </button>
      </header>

      {/* Tab 栏 */}
      <nav className="flex border-b border-[#E8DDD3] bg-[var(--color-bg-card)]" role="tablist" aria-label="管理面板导航">
        {([['users', '用户'], ['conversations', '对话'], ['stats', '统计'], ['errors', '错误日志']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => { setTab(key); setSelectedConversation(null); setFilterUserId(null) }}
            className={`flex-1 py-3 text-sm font-medium transition-colors min-h-[var(--touch-min)] ${
              tab === key ? 'text-teal-600 border-b-2 border-teal-500' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* 内容区 */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3" role="tabpanel">
        {/* 用户列表 */}
        {tab === 'users' && (
          users.length === 0 ? (
            <div className="text-center py-12 text-[var(--color-text-muted)]">
              <p className="text-3xl mb-2">🌱</p>
              <p>还没有用户注册，等他们来吧</p>
            </div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--color-text-primary)]">{u.nickname || '未设置昵称'}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {u.grade ? `${u.grade}年级` : '未选年级'} · {u.phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--color-text-muted)]">{formatTime(u.last_active_at)}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setTab('conversations'); setFilterUserId(u.id) }}
                  className="mt-2 text-xs text-teal-500 hover:text-teal-600 min-h-[var(--touch-min)] flex items-center"
                >
                  查看对话 →
                </button>
              </div>
            ))
          )
        )}

        {/* 对话列表 */}
        {tab === 'conversations' && !selectedConversation && (
          <>
            {filterUserId && (
              <button onClick={() => setFilterUserId(null)} className="text-xs text-[var(--color-text-muted)] hover:text-teal-500 mb-2 min-h-[var(--touch-min)] flex items-center">
                ← 查看全部对话
              </button>
            )}
            {conversations.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-text-muted)]">
                <p className="text-3xl mb-2">💭</p>
                <p>{filterUserId ? '这个用户还没有对话' : '还没有任何对话'}</p>
              </div>
            ) : (
              conversations.map((c) => {
                const hasAuditFlag = c.audit_flags && c.audit_flags !== '[]'
                return (
                  <button
                    key={c.id}
                    onClick={() => viewConversation(c.id)}
                    className={`w-full text-left bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border shadow-sm transition-all hover:shadow-md ${
                      hasAuditFlag ? 'border-amber-200 bg-amber-50/30' : 'border-[#E8DDD3]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-[var(--color-text-primary)] text-sm">
                        {c.nickname || '未知用户'} · {c.grade ? `${c.grade}年级` : ''}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">{formatTime(c.started_at)}</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      {c.message_count}条消息
                      {c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)}分钟` : ''}
                      {c.subject ? ` · ${c.subject === 'math' ? '数学' : c.subject === 'chinese' ? '语文' : '英语'}` : ''}
                    </p>
                    {c.resolution_type && (
                      <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                        c.resolution_type === 'independent' ? 'bg-green-100 text-green-600' :
                        c.resolution_type === 'guided' ? 'bg-blue-100 text-blue-600' :
                        'bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]'
                      }`}>
                        {c.resolution_type === 'independent' ? '自主解决' :
                         c.resolution_type === 'guided' ? '引导解决' : '未解决'}
                      </span>
                    )}
                    {c.strategies_used && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(() => { try { return JSON.parse(c.strategies_used) as string[] } catch { return [] } })().map((s, i) => (
                          <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500">{s}</span>
                        ))}
                      </div>
                    )}
                    {hasAuditFlag && (
                      <p className="text-xs text-amber-600 mt-1">合规标记</p>
                    )}
                  </button>
                )
              })
            )}
          </>
        )}

        {/* 对话详情 */}
        {tab === 'conversations' && selectedConversation && (
          <>
            <button onClick={() => { setSelectedConversation(null); setMessages([]) }} className="text-xs text-[var(--color-text-muted)] hover:text-teal-500 mb-2 min-h-[var(--touch-min)] flex items-center">
              ← 返回对话列表
            </button>
            {messages.length === 0 ? (
              <p className="text-center text-[var(--color-text-muted)] py-8">加载中...</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`rounded-[var(--radius-card)] p-3 text-sm ${
                  m.role === 'user'
                    ? 'bg-teal-50 border border-teal-100 ml-8'
                    : 'bg-[var(--color-bg-card)] border border-[#E8DDD3] mr-8'
                }`}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                      {m.role === 'user' ? '学生' : 'AI教练'}
                    </span>
                    {m.input_method && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {m.input_method === 'voice' ? '🎤' : m.input_method === 'ocr' ? '📷' : m.input_method === 'rtc' ? '🗣️' : '⌨️'}
                      </span>
                    )}
                    {m.emotion && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        m.emotion === '困惑' ? 'bg-amber-100 text-amber-600' :
                        m.emotion === '沮丧' ? 'bg-rose-100 text-rose-600' :
                        m.emotion === '兴奋' ? 'bg-green-100 text-green-600' :
                        m.emotion === '自信' ? 'bg-blue-100 text-blue-600' :
                        m.emotion === '惊喜' ? 'bg-yellow-100 text-yellow-600' :
                        m.emotion === '好奇' ? 'bg-indigo-100 text-indigo-600' :
                        m.emotion === '困倦' ? 'bg-slate-100 text-slate-600' :
                        m.emotion === '专注' ? 'bg-cyan-100 text-cyan-600' :
                        'bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]'
                      }`}>
                        {m.emotion}
                      </span>
                    )}
                    {m.session_phase && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">
                        {m.session_phase === 'variant_asked' ? '变式' : '完成'}
                      </span>
                    )}
                    <span className="text-xs text-[var(--color-text-muted)] ml-auto">{formatTime(m.created_at)}</span>
                  </div>
                  <p className="text-[var(--color-text-primary)] whitespace-pre-wrap">{m.content}</p>
                  {m.compliance_issues && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(() => { try { return JSON.parse(m.compliance_issues) as string[] } catch { return [] } })().map((issue, i) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-100">
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* 统计面板 */}
        {tab === 'stats' && (
          stats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] text-center shadow-sm">
                  <p className="text-2xl font-bold text-teal-600">{stats.totalUsers}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">注册用户</p>
                </div>
                <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] text-center shadow-sm">
                  <p className="text-2xl font-bold text-teal-600">{stats.activeToday}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">今日活跃</p>
                </div>
                <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] text-center shadow-sm">
                  <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.totalConversations}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">总对话数</p>
                </div>
                <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] text-center shadow-sm">
                  <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                    {stats.avgDuration ? `${Math.round(stats.avgDuration / 60)}分` : '—'}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">平均时长</p>
                </div>
              </div>

              {/* 解题结果分布 */}
              {stats.resolutionBreakdown && stats.resolutionBreakdown.length > 0 && (
                <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] shadow-sm">
                  <p className="text-xs text-[var(--color-text-muted)] mb-2 font-medium">解题结果</p>
                  <div className="space-y-1">
                    {stats.resolutionBreakdown.map((r) => (
                      <div key={r.resolution_type} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">
                          {r.resolution_type === 'independent' ? '自主解决' :
                           r.resolution_type === 'guided' ? '引导解决' : '未解决'}
                        </span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{r.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 学科分布 */}
              {stats.subjectBreakdown && stats.subjectBreakdown.length > 0 && (
                <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] shadow-sm">
                  <p className="text-xs text-[var(--color-text-muted)] mb-2 font-medium">学科分布</p>
                  <div className="space-y-1">
                    {stats.subjectBreakdown.map((s) => (
                      <div key={s.subject} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">
                          {s.subject === 'math' ? '数学' : s.subject === 'chinese' ? '语文' : '英语'}
                        </span>
                        <span className="font-semibold text-[var(--color-text-primary)]">{s.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 合规问题 */}
              {stats.complianceIssueCount > 0 && (
                <div className="bg-amber-50 rounded-[var(--radius-card)] p-4 border border-amber-100 shadow-sm">
                  <p className="text-xs text-amber-600 font-medium">合规问题消息</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">{stats.complianceIssueCount}</p>
                </div>
              )}

              {stats.totalUsers === 0 && (
                <div className="text-center py-8 text-[var(--color-text-muted)]">
                  <p className="text-3xl mb-2">📊</p>
                  <p>数据太少，等有人用了再看</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )
        )}

        {/* 错误日志 */}
        {tab === 'errors' && (
          errors.length === 0 ? (
            <div className="text-center py-12 text-[var(--color-text-muted)]">
              <p className="text-3xl mb-2">🎉</p>
              <p>暂无错误日志，一切正常</p>
            </div>
          ) : (
            errors.map((e) => (
              <button
                key={e.id}
                onClick={() => setExpandedErrorId(expandedErrorId === e.id ? null : e.id)}
                className="w-full text-left bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-4 border border-[#E8DDD3] shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      e.source === 'server'
                        ? 'bg-rose-100 text-rose-600'
                        : 'bg-amber-100 text-amber-600'
                    }`}>
                      {e.source}
                    </span>
                    {e.path && <span className="text-xs text-[var(--color-text-muted)]">{e.path}</span>}
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)]">{formatTime(e.created_at)}</span>
                </div>
                <p className="text-sm text-[var(--color-text-primary)] mt-2 truncate">{e.message}</p>
                {expandedErrorId === e.id && (
                  <div className="mt-3 space-y-2" onClick={(ev) => ev.stopPropagation()}>
                    {e.stack && (
                      <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                        {e.stack}
                      </pre>
                    )}
                    {e.meta && (
                      <pre className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-primary)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                        {(() => { try { return JSON.stringify(JSON.parse(e.meta), null, 2) } catch { return e.meta } })()}
                      </pre>
                    )}
                    {e.user_id && (
                      <p className="text-xs text-[var(--color-text-muted)]">用户: {e.user_id}</p>
                    )}
                  </div>
                )}
              </button>
            ))
          )
        )}
      </main>
    </div>
  )
}
