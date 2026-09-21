// PhotoStager: stage photos on a New Movement / Return form before the record exists.
// PhotoSection: view / add / delete photos on an existing record.
// CameraCapture: in-app camera — snap as many shots as you like in one go, then add
//   them all at once (iOS's file-picker camera only ever returns ONE photo per tap).
// PhotoViewer: full-screen viewer with pinch / double-tap zoom + pan.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { listPhotos, uploadPhoto, deletePhoto, type PhotoLinks } from '../lib/photos'
import type { Photo, PhotoType } from '../lib/types'
import { ErrorBanner, IconCamera, IconDoc, IconX, SectionHeader, Sheet, Spinner } from './ui'

const hasCamera = () =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

// --------------------------------------------------------------- camera

function CameraCapture({
  open,
  onClose,
  onDone,
  onUseLibrary,
}: {
  open: boolean
  onClose: () => void
  onDone: (files: File[]) => void
  onUseLibrary: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [shots, setShots] = useState<{ file: File; url: string }[]>([])
  const [ready, setReady] = useState(false)
  const [flash, setFlash] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setErr('')
    setReady(false)
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch {
        if (!cancelled) setErr('Could not open the camera. Allow camera access in your browser settings, or pick photos from your library instead.')
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [open])

  // Drop any un-kept shots when the camera closes.
  useEffect(() => {
    if (open) return
    setShots((s) => {
      s.forEach((x) => URL.revokeObjectURL(x.url))
      return []
    })
  }, [open])

  const snap = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    setFlash(true)
    setTimeout(() => setFlash(false), 110)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
        setShots((s) => [...s, { file, url: URL.createObjectURL(blob) }])
      },
      'image/jpeg',
      0.92,
    )
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" data-testid="camera">
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-contain" />
        {flash && <div className="absolute inset-0 bg-white/80" />}
        {!ready && !err && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        {err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-[15px] text-white/90">{err}</p>
            <button
              type="button"
              onClick={onUseLibrary}
              className="rounded-xl bg-white/15 px-4 py-2.5 text-[15px] font-semibold text-white"
            >
              Choose from library
            </button>
          </div>
        )}
      </div>

      {shots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-2">
          {shots.map((s, i) => (
            <div key={i} className="relative shrink-0">
              <img src={s.url} alt="" className="h-14 w-14 rounded-lg object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() =>
                  setShots((prev) => {
                    const next = prev.filter((_, j) => j !== i)
                    URL.revokeObjectURL(prev[i].url)
                    return next
                  })
                }
                className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-ios-label"
              >
                <IconX size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pb-safe grid grid-cols-3 items-center px-6 py-4">
        <button type="button" onClick={onClose} className="justify-self-start text-[17px] font-semibold text-white">
          Cancel
        </button>
        <button
          type="button"
          aria-label="Take photo"
          data-testid="shutter"
          disabled={!ready}
          onClick={snap}
          className="h-[70px] w-[70px] justify-self-center rounded-full border-[5px] border-white bg-white/25 active:bg-white/60 disabled:opacity-40"
        />
        <button
          type="button"
          disabled={!shots.length}
          onClick={() => onDone(shots.map((s) => s.file))}
          className="justify-self-end text-[17px] font-semibold text-white disabled:opacity-40"
        >
          {shots.length ? `Done (${shots.length})` : 'Done'}
        </button>
      </div>
    </div>
  )
}

// --------------------------------------------------------- add-photo tile

function SheetRow({ icon, title, subtitle, onClick }: { icon: ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-ios-card px-4 py-3.5 text-left shadow-card"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ios-blue text-white">{icon}</span>
      <span>
        <span className="block text-[17px] font-semibold">{title}</span>
        <span className="block text-[14px] text-ios-label2">{subtitle}</span>
      </span>
    </button>
  )
}

/** The dashed "Add" tile: offers the multi-shot camera or a multi-select library pick. */
function AddPhotoButton({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheet, setSheet] = useState(false)
  const [camera, setCamera] = useState(false)
  const openLibrary = () => inputRef.current?.click()

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (hasCamera() ? setSheet(true) : openLibrary())}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ios-gray2 text-ios-gray disabled:opacity-50"
      >
        <IconCamera size={24} />
        <span className="text-[11px] font-medium">Add</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? [])
          if (chosen.length) onFiles(chosen)
          e.target.value = ''
        }}
      />

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Add photos">
        <div className="flex flex-col gap-2">
          <SheetRow
            icon={<IconCamera size={22} />}
            title="Take photos"
            subtitle="Keep snapping — add them all at the end"
            onClick={() => {
              setSheet(false)
              setCamera(true)
            }}
          />
          <SheetRow
            icon={<IconDoc size={22} />}
            title="Photo library"
            subtitle="Pick as many photos as you like"
            onClick={() => {
              setSheet(false)
              openLibrary()
            }}
          />
        </div>
      </Sheet>

      <CameraCapture
        open={camera}
        onClose={() => setCamera(false)}
        onUseLibrary={() => {
          setCamera(false)
          openLibrary()
        }}
        onDone={(files) => {
          setCamera(false)
          if (files.length) onFiles(files)
        }}
      />
    </>
  )
}

// -------------------------------------------------------------- stager

export function PhotoStager({
  label,
  files,
  onChange,
}: {
  label: string
  files: File[]
  onChange: (files: File[]) => void
}) {
  const [previews, setPreviews] = useState<string[]>([])

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  return (
    <div>
      <div className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-ios-label2 uppercase">{label}</div>
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={i} className="relative">
            <img src={src} alt="" className="h-20 w-20 rounded-xl object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ios-label text-white"
            >
              <IconX size={13} />
            </button>
          </div>
        ))}
        <AddPhotoButton onFiles={(chosen) => onChange([...files, ...chosen])} />
      </div>
    </div>
  )
}

/** Upload staged files after the record has been created. Returns count uploaded. */
export async function uploadStaged(
  files: File[],
  photoType: PhotoType,
  links: PhotoLinks,
  staffId: string,
): Promise<number> {
  let ok = 0
  for (const f of files) {
    await uploadPhoto(f, photoType, links, staffId)
    ok++
  }
  return ok
}

const typeLabels: Record<PhotoType, string> = {
  before_handover: 'Before handover',
  after_return: 'After return',
  damage: 'Damage',
  odometer: 'Odometer',
  fuel: 'Fuel',
  other: 'Other',
  tow_card: 'Tow card',
}

// -------------------------------------------------------- zoomable viewer

const MAX_ZOOM = 6

function PhotoViewer({ url, onClose, onDelete }: { url: string; onClose: () => void; onDelete: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tr, setTr] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; mid: { x: number; y: number }; scale: number; tr: { x: number; y: number } } | null>(null)
  const pan = useRef<{ x: number; y: number; tr: { x: number; y: number } } | null>(null)
  const lastTap = useRef(0)

  // Keep the picture covering the frame: translation is bounded by how far it's zoomed.
  const clamp = (t: { x: number; y: number }, s: number) => {
    const el = wrapRef.current
    const w = el?.clientWidth ?? 0
    const h = el?.clientHeight ?? 0
    const minX = Math.min(0, w * (1 - s))
    const minY = Math.min(0, h * (1 - s))
    return { x: Math.min(0, Math.max(minX, t.x)), y: Math.min(0, Math.max(minY, t.y)) }
  }

  const rel = (x: number, y: number) => {
    const r = wrapRef.current?.getBoundingClientRect()
    return { x: x - (r?.left ?? 0), y: y - (r?.top ?? 0) }
  }

  const zoomTo = (s: number, atX: number, atY: number) => {
    const next = Math.max(1, Math.min(MAX_ZOOM, s))
    if (next === 1) {
      setScale(1)
      setTr({ x: 0, y: 0 })
      return
    }
    const p = rel(atX, atY)
    const c = { x: (p.x - tr.x) / scale, y: (p.y - tr.y) / scale }
    setScale(next)
    setTr(clamp({ x: p.x - c.x * next, y: p.y - c.y * next }, next))
  }

  function onPointerDown(e: React.PointerEvent) {
    // Capture keeps a drag alive outside the frame — but it throws for some
    // pointer sources, and a failed capture must never kill the gesture.
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch { /* gestures work without capture */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scale,
        tr,
      }
      pan.current = null
    } else if (pointers.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, tr }
      const now = Date.now()
      if (now - lastTap.current < 300) {
        zoomTo(scale > 1 ? 1 : 3, e.clientX, e.clientY)
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = pinch.current
    if (pointers.current.size >= 2 && g) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const next = Math.max(1, Math.min(MAX_ZOOM, g.scale * (dist / g.dist)))
      const start = rel(g.mid.x, g.mid.y)
      const now = rel((a.x + b.x) / 2, (a.y + b.y) / 2)
      const c = { x: (start.x - g.tr.x) / g.scale, y: (start.y - g.tr.y) / g.scale }
      setScale(next)
      setTr(clamp({ x: now.x - c.x * next, y: now.y - c.y * next }, next))
    } else if (pointers.current.size === 1 && pan.current && scale > 1) {
      const p = pan.current
      setTr(clamp({ x: p.tr.x + (e.clientX - p.x), y: p.tr.y + (e.clientY - p.y) }, scale))
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      pan.current = null
    } else {
      const [only] = [...pointers.current.values()]
      pan.current = { x: only.x, y: only.y, tr }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div
        ref={wrapRef}
        data-testid="photo-zoom"
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          data-testid="photo-zoom-inner"
          className="absolute inset-0"
          style={{ transform: `translate(${tr.x}px, ${tr.y}px) scale(${scale})`, transformOrigin: '0 0' }}
        >
          <img src={url} alt="" draggable={false} className="h-full w-full object-contain select-none" />
        </div>
      </div>

      <p className="pt-2 text-center text-[12px] text-white/50">
        {scale > 1 ? `Zoomed ${scale.toFixed(1)}× · drag to move` : 'Pinch or double-tap to zoom'}
      </p>
      <div className="pb-safe flex items-center justify-between p-4">
        <button type="button" className="text-[17px] font-semibold text-white" onClick={onClose}>
          Close
        </button>
        {scale > 1 && (
          <button
            type="button"
            className="text-[15px] font-medium text-white/70"
            onClick={() => {
              setScale(1)
              setTr({ x: 0, y: 0 })
            }}
          >
            Reset
          </button>
        )}
        <button type="button" className="text-[17px] font-semibold text-ios-red" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- section

export function PhotoSection({
  links,
  defaultType,
  staffId,
  title = 'Photos',
  filterType,
}: {
  links: PhotoLinks
  defaultType: PhotoType
  staffId: string
  title?: string
  filterType?: PhotoType
}) {
  const [photos, setPhotos] = useState<(Photo & { url: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [viewer, setViewer] = useState<(Photo & { url: string }) | null>(null)
  const [staged, setStaged] = useState<File[]>([])
  const [stagedUrls, setStagedUrls] = useState<string[]>([])

  const reload = () => {
    listPhotos(links)
      .then((p) => { setPhotos(p); setErr('') })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [links.movement_id, links.return_id, links.booking_id, links.vehicle_id])

  // Preview URLs for photos staged locally before the one-tap batch upload.
  useEffect(() => {
    const urls = staged.map((f) => URL.createObjectURL(f))
    setStagedUrls(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [staged])

  async function uploadAll() {
    if (!staged.length) return
    setBusy(true)
    setErr('')
    try {
      await uploadStaged(staged, filterType ?? defaultType, links, staffId)
      setStaged([])
      reload()
    } catch (e) {
      // Surface the failure — a silently-dropped photo is a real problem.
      setErr(`Photo upload failed: ${e instanceof Error ? e.message : String(e)}. Check your connection and try again.`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: Photo & { url: string }) {
    if (!confirm('Delete this photo?')) return
    await deletePhoto(p)
    setViewer(null)
    reload()
  }

  const shown = filterType ? photos.filter((p) => p.photo_type === filterType) : photos

  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <div className="rounded-card bg-ios-card p-4 shadow-card">
        <ErrorBanner message={err} />
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {shown.map((p) => (
                <button key={p.id} type="button" onClick={() => setViewer(p)} className="relative">
                  <img src={p.url} alt={typeLabels[p.photo_type]} className="h-20 w-20 rounded-xl object-cover" />
                  {!filterType && (
                    <span className="absolute right-0 bottom-0 left-0 rounded-b-xl bg-black/45 px-1 py-0.5 text-center text-[9px] font-medium text-white">
                      {typeLabels[p.photo_type]}
                    </span>
                  )}
                </button>
              ))}
              {stagedUrls.map((src, i) => (
                <div key={`staged-${i}`} className="relative">
                  <img src={src} alt="" className="h-20 w-20 rounded-xl object-cover ring-2 ring-ios-blue" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setStaged((s) => s.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ios-label text-white"
                  >
                    <IconX size={13} />
                  </button>
                </div>
              ))}
              <AddPhotoButton disabled={busy} onFiles={(chosen) => setStaged((s) => [...s, ...chosen])} />
            </div>
            {staged.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={uploadAll}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ios-blue py-2.5 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                {busy && <Spinner />}
                {busy ? 'Uploading…' : `Upload ${staged.length} photo${staged.length === 1 ? '' : 's'}`}
              </button>
            )}
          </>
        )}
      </div>

      {viewer && <PhotoViewer url={viewer.url} onClose={() => setViewer(null)} onDelete={() => remove(viewer)} />}
    </div>
  )
}
