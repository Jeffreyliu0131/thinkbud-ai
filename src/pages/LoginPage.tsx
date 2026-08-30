import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { fetchWithTimeout } from '../lib/api'
import BudMascot from '../components/BudMascot'
import './LoginPage.css'

type Step = 'phone' | 'code' | 'profile'

const GRADE_OPTIONS = [
  { value: 1, label: '1-3年级', sub: '刚开始探索' },
  { value: 4, label: '4-6年级', sub: '已经会不少' },
]

const STEP_COPY: Record<Step, { label: string; title: string; detail: string }> = {
  phone: { label: '登录', title: '开始一次思考练习', detail: '输入手机号获取验证码。' },
  code: { label: '验证', title: '输入六位验证码', detail: '验证成功后会回到你的学习记录。' },
  profile: { label: '设置', title: '先认识一下你', detail: '昵称和年级只用于调整提问方式。' },
}

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
    <main className="thinkbud-access-page">
      <div className="thinkbud-access-shell">
        <section className="thinkbud-access-story" aria-labelledby="thinkbud-access-title">
          <div className="thinkbud-access-story__mascot" aria-hidden="true">
            <BudMascot animate={step === 'profile' ? 'wave' : 'idle'} />
          </div>
          <p className="thinkbud-access-story__brand">ThinkBud</p>
          <h1 id="thinkbud-access-title">不替孩子答题，只陪孩子想通。</h1>
          <p className="thinkbud-access-story__lede">先问一个好问题，再验证孩子能不能把方法用到下一题。</p>
          <Link className="thinkbud-access-story__demo" to="/showcase">
            查看无需登录的公开演示 <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </section>

        <section className="thinkbud-access-card" aria-labelledby="thinkbud-form-title">
          <header className="thinkbud-access-card__header">
            <span>{STEP_COPY[step].label}</span>
            <h2 id="thinkbud-form-title">{STEP_COPY[step].title}</h2>
            <p>{STEP_COPY[step].detail}</p>
          </header>

        {step === 'phone' && (
          <div className="thinkbud-access-form">
            <label className="thinkbud-field" htmlFor="phone-input">
              <span>手机号</span>
              <input
                id="phone-input"
                type="tel"
                inputMode="numeric"
                placeholder="请输入 11 位手机号"
                aria-label="手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                autoFocus
              />
            </label>
            <button
              onClick={handleSendCode}
              disabled={isLoading || phone.length !== 11}
              className="thinkbud-access-submit"
            >
              {isLoading ? '发送中…' : '获取验证码'}
            </button>
            <p className="thinkbud-access-form__note">
              首次登录自动注册 · 我们不存储你的手机号
            </p>
          </div>
        )}

        {step === 'code' && (
          <div className="thinkbud-access-form">
            <p className="thinkbud-access-form__context">
              已发送到 {phone.slice(0, 3)}****{phone.slice(-4)}
            </p>
            <div className="thinkbud-code-grid" role="group" aria-label="6位验证码输入">
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
                  disabled={isLoading}
                />
              ))}
            </div>
            {isLoading && (
              <p className="thinkbud-access-form__status" role="status">验证中…</p>
            )}
            {code.length === 6 && !isLoading && (
              <button
                onClick={() => handleVerify()}
                className="thinkbud-access-submit"
              >
                验证
              </button>
            )}
            <button
              onClick={handleSendCode}
              disabled={countdown > 0}
              className="thinkbud-access-secondary"
            >
              {countdown > 0 ? `${countdown}秒后可重新发送` : '重新发送验证码'}
            </button>
          </div>
        )}

        {step === 'profile' && (
          <div className="thinkbud-access-form">
            <label className="thinkbud-field" htmlFor="nickname-input">
              <span>孩子的昵称</span>
              <input
                id="nickname-input"
                type="text"
                placeholder="例如：小禾"
                aria-label="孩子的昵称"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                autoFocus
              />
            </label>

            <fieldset className="thinkbud-grade-fieldset">
              <legend>选择年级</legend>
              <div role="radiogroup" aria-label="选择年级">
              {GRADE_OPTIONS.map(({ value, label, sub }) => (
                <button
                  key={value}
                  onClick={() => setGrade(value)}
                  type="button"
                  role="radio"
                  aria-checked={grade === value}
                  aria-label={`${label}，${sub}`}
                >
                  <strong>{label}</strong>
                  <span>{sub}</span>
                </button>
              ))}
              </div>
            </fieldset>

            <button
              onClick={handleCompleteProfile}
              disabled={isLoading || !nickname.trim() || !grade}
              className="thinkbud-access-submit"
            >
              {isLoading ? '保存中…' : '开始学习'}
            </button>
          </div>
        )}

          <footer className="thinkbud-access-card__footer">
            <span>AI 引导思路，孩子完成答案。</span>
            <Link to="/showcase">公开演示</Link>
          </footer>
        </section>
      </div>
    </main>
  )
}
