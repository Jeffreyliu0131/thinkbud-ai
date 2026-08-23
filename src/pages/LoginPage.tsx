import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { fetchWithTimeout } from '../lib/api'
import BudMascot from '../components/BudMascot'

type Step = 'phone' | 'code' | 'profile'

const GRADE_OPTIONS = [
  { key: 'lower' as const, value: 1, label: '1-3年级', sub: '刚开始探索', bg: 'bg-gradient-to-br from-orange-50 to-rose-50', border: 'border-orange-100' },
  { key: 'upper' as const, value: 4, label: '4-6年级', sub: '已经会不少', bg: 'bg-gradient-to-br from-sky-50 to-indigo-50', border: 'border-sky-100' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, saveProfile, isAuthenticated } = useAuth()
  const { showToast } = useToast()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [grade, setGrade] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const verifyingRef = useRef(false) // 防止自动验证重复触发

  // 已登录直接跳转
  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // 发送验证码
  const handleSendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      showToast('请输入正确的手机号', 'error')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetchWithTimeout('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
        timeout: 10000,
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        throw new Error(data.error)
      }
      const data = await res.json() as { success: boolean; code?: string }
      setStep('code')
      setCountdown(60)
      // invite 模式：服务端直接返回验证码，自动填充
      if (data.code) {
        setCode(data.code)
        showToast(`测试模式：验证码 ${data.code}`, 'success')
        // 自动提交
        setTimeout(() => handleVerify(data.code!), 300)
      } else {
        showToast('验证码已发送', 'success')
        // 自动聚焦第一个格子
        setTimeout(() => codeInputRefs.current[0]?.focus(), 100)
      }
    } catch (err) {
      showToast((err as Error).message || '发送失败', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // 验证码输入（6格）
  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const digit = value.slice(-1)
    const newCode = code.split('')
    newCode[index] = digit
    const joined = newCode.join('')
    setCode(joined)

    // 自动跳下一格
    if (digit && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }

    // 6位满自动验证
    if (joined.length === 6 && /^\d{6}$/.test(joined)) {
      handleVerify(joined)
    }
  }

  // 退格处理
  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  // 验证
  const handleVerify = async (codeValue?: string) => {
    const verifyCode = codeValue || code
    if (verifyCode.length !== 6) return
    if (verifyingRef.current) return // 防止重复触发
    verifyingRef.current = true
    setIsLoading(true)
    try {
      const result = await login(phone, verifyCode)
      if (result.isNewUser) {
        setStep('profile')
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      const msg = (err as Error).message || '验证失败'
      console.error('[Verify Error]', msg, err)
      showToast(msg, 'error')
      setCode('')
      codeInputRefs.current[0]?.focus()
    } finally {
      verifyingRef.current = false
      setIsLoading(false)
    }
  }

  // 完善资料（用 JWT 认证的 profile 端点，不再重复消耗验证码）
  const handleCompleteProfile = async () => {
    if (!nickname.trim()) {
      showToast('请输入昵称', 'error')
      return
    }
    if (!grade) {
      showToast('请选择年级', 'error')
      return
    }
    setIsLoading(true)
    try {
      await saveProfile(nickname.trim(), grade)
      localStorage.setItem('thinkbud_grade', grade <= 3 ? 'lower' : 'upper')
      navigate('/', { replace: true })
    } catch (err) {
      showToast((err as Error).message || '保存失败', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="relative flex flex-col items-center justify-center h-full px-6 overflow-hidden page-enter-fade-up bg-[var(--color-bg-primary)]" style={{ paddingTop: 'max(2rem, var(--safe-top))', paddingBottom: 'max(2rem, var(--safe-bottom))' }}>
      {/* 装饰背景 */}
      <div className="absolute top-12 left-8 w-32 h-32 rounded-full bg-teal-200/[0.07] blur-2xl" aria-hidden="true" />
      <div className="absolute bottom-20 right-6 w-40 h-40 rounded-full bg-amber-200/[0.08] blur-2xl" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        {/* 吉祥物 */}
        <div className="w-24 h-28 mb-3 animate-fade-up" aria-hidden="true">
          <BudMascot animate={step === 'profile' ? 'wave' : 'idle'} />
        </div>

        {/* 标题 */}
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1 animate-fade-up" style={{ animationDelay: '100ms' }}>
          思考教练
        </h1>
        <p className="text-[var(--color-text-secondary)] text-sm mb-6 animate-fade-up" style={{ animationDelay: '200ms' }}>
          对着作业说一说，我来引导你自己想通它
        </p>

        {/* Step: 手机号输入 */}
        {step === 'phone' && (
          <div className="w-full space-y-4 animate-fade-up" style={{ animationDelay: '300ms' }}>
            <label htmlFor="phone-input" className="sr-only">手机号</label>
            <input
              id="phone-input"
              type="tel"
              inputMode="numeric"
              placeholder="请输入手机号"
              aria-label="手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              className="w-full px-4 py-3.5 rounded-[var(--radius-input)] border border-gray-200 text-base min-h-[var(--touch-min)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
              autoFocus
            />
            <button
              onClick={handleSendCode}
              disabled={isLoading || phone.length !== 11}
              className={`w-full py-3.5 text-base font-bold transition-all ${
                !isLoading && phone.length === 11
                  ? 'bg-teal-500 text-white btn-3d btn-3d-teal'
                  : 'bg-gray-100 text-[var(--color-text-muted)] cursor-not-allowed rounded-[var(--radius-pill)]'
              }`}
            >
              {isLoading ? '发送中...' : '获取验证码'}
            </button>
            <p className="text-xs text-[var(--color-text-secondary)] text-center">
              首次登录自动注册 · 我们不存储你的手机号
            </p>
          </div>
        )}

        {/* Step: 验证码 */}
        {step === 'code' && (
          <div className="w-full space-y-4 animate-fade-up">
            <p className="text-sm text-[var(--color-text-secondary)] text-center">
              已发送到 {phone.slice(0, 3)}****{phone.slice(-4)}
            </p>
            <div className="flex gap-2 justify-center" role="group" aria-label="6位验证码输入">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <input
                  key={i}
                  ref={(el) => { codeInputRefs.current[i] = el }}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={code[i] || ''}
                  onChange={(e) => handleCodeInput(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  aria-label={`验证码第${i + 1}位`}
                  className={`w-11 h-13 text-center text-xl font-bold rounded-[var(--radius-input)] border transition-all ${
                    isLoading
                      ? 'bg-gray-50 border-gray-200 text-[var(--color-text-muted)]'
                      : 'bg-[var(--color-bg-card)] border-gray-200 text-[var(--color-text-primary)] focus:ring-2 focus:ring-teal-400 focus:border-transparent'
                  }`}
                  disabled={isLoading}
                />
              ))}
            </div>
            {isLoading && (
              <p className="text-sm text-teal-500 text-center" role="status">验证中...</p>
            )}
            {/* 手动验证按钮 */}
            {code.length === 6 && !isLoading && (
              <button
                onClick={() => handleVerify()}
                className="w-full py-3 text-base font-bold bg-teal-500 text-white btn-3d btn-3d-teal transition-all"
              >
                验证
              </button>
            )}
            <button
              onClick={handleSendCode}
              disabled={countdown > 0}
              className="w-full text-sm text-[var(--color-text-secondary)] hover:text-teal-500 transition-colors min-h-[var(--touch-min)]"
            >
              {countdown > 0 ? `${countdown}秒后可重新发送` : '重新发送验证码'}
            </button>
          </div>
        )}

        {/* Step: 完善资料（新用户） */}
        {step === 'profile' && (
          <div className="w-full space-y-4 animate-fade-up">
            <p className="text-base font-bold text-[var(--color-text-primary)] text-center">给你的小学霸起个名字</p>
            <label htmlFor="nickname-input" className="sr-only">孩子的昵称</label>
            <input
              id="nickname-input"
              type="text"
              placeholder="孩子的昵称"
              aria-label="孩子的昵称"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 20))}
              className="w-full px-4 py-3.5 rounded-[var(--radius-input)] border border-gray-200 text-base min-h-[var(--touch-min)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition-all"
              autoFocus
            />

            {/* 年级选择 */}
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="选择年级">
              {GRADE_OPTIONS.map(({ value, label, sub, bg, border }) => (
                <button
                  key={value}
                  onClick={() => setGrade(value)}
                  role="radio"
                  aria-checked={grade === value}
                  aria-label={`${label}，${sub}`}
                  className={`flex flex-col items-center py-4 px-3 rounded-[var(--radius-card)] border transition-all active:scale-[0.97] min-h-[var(--touch-min)] ${bg} ${
                    grade === value
                      ? 'ring-2 ring-teal-400 shadow-lg border-transparent'
                      : `${border} hover:shadow-md`
                  }`}
                >
                  <p className="text-base font-bold text-[var(--color-text-primary)]">{label}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>
                </button>
              ))}
            </div>

            <button
              onClick={handleCompleteProfile}
              disabled={isLoading || !nickname.trim() || !grade}
              className={`w-full py-3.5 text-base font-bold transition-all ${
                !isLoading && nickname.trim() && grade
                  ? 'bg-teal-500 text-white btn-3d btn-3d-teal'
                  : 'bg-gray-100 text-[var(--color-text-muted)] cursor-not-allowed rounded-[var(--radius-pill)]'
              }`}
            >
              {isLoading ? '保存中...' : '开始学习 →'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
