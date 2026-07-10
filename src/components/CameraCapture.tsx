// In-app multi-shot camera: take as many photos as you want in one session,
// then "Use N photos" hands them all back at once. Falls back gracefully when
// the browser/device can't open a camera stream (use the Library option instead).

import { useEffect, useRef, useState } from 'react'
import { Button, IconCamera, IconCheck, IconX } from './ui'

export function CameraCapture({
  onDone,
  onClose,
}: {
  onDone: (files: File[]) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [shots, setShots] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Camera stream lifecycle — the stream is a local var so cleanup needs no ref.
  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This device can’t open the camera here — use Library instead.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch {
        setError('Couldn’t access the camera. Check the camera permission, or use Library instead.')
      }
    }
    void start()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Thumbnails: create/revoke object URLs together (same pattern as PhotoStager).
  useEffect(() => {
    const urls = shots.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [shots])

  async function snap() {
    const video = videoRef.current
    if (!video || !video.videoWidth || busy) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
      if (!blob) return
      const file = new File([blob], `camera-${Date.now()}-${shots.length + 1}.jpg`, { type: 'image/jpeg' })
      setShots((prev) => [...prev, file])
    } finally {
      setBusy(false)
    }
  }

  const removeShot = (i: number) => setShots((prev) => prev.filter((_, j) => j !== i))
  const finish = () => (shots.length ? onDone(shots) : onClose())

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top bar */}
      <div className="pt-safe flex items-center justify-between px-4 py-3 text-white">
        <button type="button" onClick={onClose} className="flex h-10 items-center gap-1 text-[17px] font-semibold active:opacity-60">
          <IconX size={22} /> Close
        </button>
        <span className="text-[15px] font-medium text-white/80">
          {shots.length ? `${shots.length} photo${shots.length === 1 ? '' : 's'}` : 'Camera'}
        </span>
        <span className="w-16" />
      </div>

      {/* Viewfinder / error */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="mx-auto max-w-xs px-6 text-center">
            <p className="text-[17px] text-white">{error}</p>
            <Button variant="secondary" className="mt-5" full onClick={onClose}>Close</Button>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-contain" />
        )}
      </div>

      {/* Thumbnail strip */}
      {previews.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-2">
          {previews.map((src, i) => (
            <div key={i} className="relative shrink-0">
              <img src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => removeShot(i)}
                className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-ios-label"
              >
                <IconX size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom controls */}
      {!error && (
        <div className="pb-safe flex items-center justify-between px-6 py-4">
          <span className="w-24" />
          <button
            type="button"
            aria-label="Take photo"
            onClick={snap}
            disabled={!ready || busy}
            className="flex h-18 w-18 items-center justify-center rounded-full border-4 border-white/80 disabled:opacity-40"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ios-label">
              <IconCamera size={26} />
            </span>
          </button>
          <div className="flex w-24 justify-end">
            <button
              type="button"
              onClick={finish}
              disabled={!shots.length}
              className="flex items-center gap-1 text-[17px] font-semibold text-ios-blue disabled:text-white/40"
            >
              <IconCheck size={20} /> Use{shots.length ? ` ${shots.length}` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
