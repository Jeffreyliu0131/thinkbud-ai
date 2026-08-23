import { useRef, useState, useCallback } from 'react'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = useCallback(async (options?: { preferFront?: boolean }) => {
    try {
      setError(null)
      // 释放上一次的 stream，防止泄漏
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      const facingMode = options?.preferFront ? 'user' : 'environment'
      const videoConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } }
      let stream: MediaStream

      try {
        // 优先尝试指定摄像头（ideal 允许回退）
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, ...videoConstraints },
          audio: false,
        })
      } catch {
        // 约束失败（无后摄等）→ 去掉 facingMode，让浏览器自选
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })
      }

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setIsOpen(true)
    } catch (err) {
      setError('无法访问相机，请检查权限设置')
      console.error('Camera error:', err)
    }
  }, [])

  const close = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsOpen(false)
  }, [])

  const capture = useCallback((): string | null => {
    const video = videoRef.current
    if (!video) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)

    // Compress to JPEG, max ~2MB
    let quality = 0.8
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length > 2 * 1024 * 1024 && quality > 0.3) {
      quality -= 0.1
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }

    return dataUrl
  }, [])

  return { videoRef, isOpen, error, open, close, capture }
}
