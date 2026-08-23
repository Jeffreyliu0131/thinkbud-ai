import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { fetchWithTimeout } from '../lib/api'

interface AuthUser {
  id: string
  nickname: string | null
  grade: number | null
  onboardingCompleted: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (phone: string, code: string) => Promise<{ isNewUser: boolean }>
  logout: () => Promise<void>
  saveProfile: (nickname: string, grade: number) => Promise<void>
  updateProfile: (nickname: string, grade: number) => void
  completeOnboarding: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 启动时检查登录状态
  useEffect(() => {
    fetchWithTimeout('/api/auth/me', { timeout: 5000 })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json() as { user: { id: string; nickname: string | null; grade: number | null; onboarding_completed: number } }
          setUser({
            id: data.user.id,
            nickname: data.user.nickname,
            grade: data.user.grade,
            onboardingCompleted: !!data.user.onboarding_completed,
          })
        }
      })
      .catch(() => {}) // 未登录或网络错误，静默
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (phone: string, code: string) => {
    const res = await fetchWithTimeout('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
      timeout: 10000,
    })

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`
      try {
        const data = await res.json() as { error?: string }
        errMsg = data.error || errMsg
      } catch {
        errMsg = await res.text().catch(() => errMsg)
      }
      throw new Error(errMsg)
    }

    const text = await res.text()
    let data: { isNewUser: boolean; user: AuthUser; success?: boolean }
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`响应解析失败: ${text.substring(0, 100)}`)
    }
    setUser(data.user)
    return { isNewUser: data.isNewUser }
  }, [])

  const logout = useCallback(async () => {
    await fetchWithTimeout('/api/auth/logout', { method: 'POST', timeout: 5000 }).catch(e => console.warn('[Auth] 登出请求失败:', e))
    setUser(null)
  }, [])

  const saveProfile = useCallback(async (nickname: string, grade: number) => {
    const res = await fetchWithTimeout('/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, grade }),
      timeout: 10000,
    })
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`
      try {
        const data = await res.json() as { error?: string }
        errMsg = data.error || errMsg
      } catch {
        errMsg = await res.text().catch(() => errMsg)
      }
      throw new Error(errMsg)
    }
    setUser(prev => prev ? { ...prev, nickname, grade, onboardingCompleted: true } : null)
  }, [])

  const updateProfile = useCallback((nickname: string, grade: number) => {
    setUser(prev => prev ? { ...prev, nickname, grade } : null)
  }, [])

  const completeOnboarding = useCallback(() => {
    setUser(prev => prev ? { ...prev, onboardingCompleted: true } : null)
    // fire-and-forget: 通知服务端
    fetchWithTimeout('/api/auth/onboarding', { method: 'POST', timeout: 5000 }).catch(() => {})
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      saveProfile,
      updateProfile,
      completeOnboarding,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
