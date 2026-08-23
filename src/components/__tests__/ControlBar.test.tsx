// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ControlBar from '../chat/ControlBar'
import type { InteractionPhase, StudentMood } from '../../types'

const defaultProps = {
  phase: 'idle' as InteractionPhase,
  hasOcr: false,
  showGotIt: false,
  sttTranscript: '',
  sttError: '',
  ttsError: '',
  hasMessages: false,
  onTalkPress: vi.fn(),
  onSwitchProblem: vi.fn(),
  onGotIt: vi.fn(),
  onMoodSelect: vi.fn(),
  onRetrySTT: vi.fn(),
}

afterEach(() => cleanup())

function renderControlBar(overrides: Partial<typeof defaultProps> = {}) {
  return render(<ControlBar {...defaultProps} {...overrides} />)
}

describe('ControlBar', () => {
  describe('麦克风按钮', () => {
    it('idle 状态显示麦克风图标', () => {
      renderControlBar()
      expect(screen.getByLabelText('开始语音对话')).toBeDefined()
    })

    it('listening 状态显示停止图标', () => {
      renderControlBar({ phase: 'listening' })
      expect(screen.getByLabelText('停止录音')).toBeDefined()
    })

    it('speaking 状态显示跳过图标', () => {
      renderControlBar({ phase: 'speaking' })
      expect(screen.getByLabelText('跳过语音播放')).toBeDefined()
    })

    it('processing 状态按钮禁用', () => {
      renderControlBar({ phase: 'processing' })
      const btn = screen.getByLabelText('正在处理，请稍候')
      expect(btn.closest('button')?.disabled).toBe(true)
    })

    it('点击触发 onTalkPress', () => {
      const onTalkPress = vi.fn()
      renderControlBar({ onTalkPress })
      fireEvent.click(screen.getByLabelText('开始语音对话'))
      expect(onTalkPress).toHaveBeenCalledOnce()
    })
  })

  describe('情绪按钮', () => {
    it('idle + hasMessages 时显示情绪按钮', () => {
      renderControlBar({ hasMessages: true })
      expect(screen.getByText('😊')).toBeDefined()
      expect(screen.getByText('😕')).toBeDefined()
      expect(screen.getByText('😢')).toBeDefined()
    })

    it('非 idle 状态不显示情绪按钮', () => {
      renderControlBar({ hasMessages: true, phase: 'listening' })
      expect(screen.queryByText('开心')).toBeNull()
    })

    it('无消息时不显示情绪按钮', () => {
      renderControlBar({ hasMessages: false })
      expect(screen.queryByText('开心')).toBeNull()
    })

    it('有 sttError 时不显示情绪按钮', () => {
      renderControlBar({ hasMessages: true, sttError: '识别失败' })
      expect(screen.queryByText('开心')).toBeNull()
    })

    it('点击情绪按钮触发 onMoodSelect', () => {
      const onMoodSelect = vi.fn()
      renderControlBar({ hasMessages: true, onMoodSelect })
      fireEvent.click(screen.getByText('😊'))
      expect(onMoodSelect).toHaveBeenCalledWith('happy' as StudentMood)
    })
  })

  describe('换题按钮', () => {
    it('hasOcr + idle 时显示换题按钮', () => {
      renderControlBar({ hasOcr: true })
      expect(screen.getByText('换题')).toBeDefined()
    })

    it('无 OCR 时不显示换题按钮', () => {
      renderControlBar({ hasOcr: false })
      expect(screen.queryByText('换题')).toBeNull()
    })

    it('非 idle 时不显示换题按钮', () => {
      renderControlBar({ hasOcr: true, phase: 'listening' })
      expect(screen.queryByText('换题')).toBeNull()
    })
  })

  describe('搞懂了按钮', () => {
    it('showGotIt 时显示', () => {
      renderControlBar({ showGotIt: true })
      expect(screen.getByText('搞懂了！')).toBeDefined()
    })

    it('点击触发 onGotIt', () => {
      const onGotIt = vi.fn()
      renderControlBar({ showGotIt: true, onGotIt })
      fireEvent.click(screen.getByText('搞懂了！'))
      expect(onGotIt).toHaveBeenCalledOnce()
    })
  })

  describe('转录文字显示', () => {
    it('RTC 字幕显示', () => {
      renderControlBar({ rtcSubtitle: '你好老师' })
      expect(screen.getByText('你好老师')).toBeDefined()
    })

    it('listening + sttTranscript 显示', () => {
      renderControlBar({ phase: 'listening', sttTranscript: '这道题' })
      expect(screen.getByText('这道题')).toBeDefined()
    })
  })

  describe('错误提示', () => {
    it('STT 错误 + idle 时显示错误和重试按钮', () => {
      renderControlBar({ sttError: '识别失败' })
      expect(screen.getByText('识别失败')).toBeDefined()
      expect(screen.getByText('再说一次')).toBeDefined()
    })

    it('点击重试触发 onRetrySTT', () => {
      const onRetrySTT = vi.fn()
      renderControlBar({ sttError: '识别失败', onRetrySTT })
      fireEvent.click(screen.getByText('再说一次'))
      expect(onRetrySTT).toHaveBeenCalledOnce()
    })

    it('TTS 错误显示', () => {
      renderControlBar({ ttsError: '播放失败' })
      expect(screen.getByText('播放失败')).toBeDefined()
    })
  })

  describe('状态提示文字', () => {
    it('idle 无消息无OCR时显示拍题引导', () => {
      renderControlBar()
      expect(screen.getByText('对准作业拍题，然后点麦克风')).toBeDefined()
    })

    it('idle 无消息有OCR时显示"点击麦克风开始对话"', () => {
      renderControlBar({ hasOcr: true })
      expect(screen.getByText('点击麦克风开始对话')).toBeDefined()
    })

    it('listening 时显示"说完会自动继续"', () => {
      renderControlBar({ phase: 'listening' })
      expect(screen.getByText('说完会自动继续')).toBeDefined()
    })

    it('speaking 时显示"点击可跳过"', () => {
      renderControlBar({ phase: 'speaking' })
      expect(screen.getByText('点击可跳过')).toBeDefined()
    })
  })
})
