// PhotoStager: stage photos on a New Movement / Return form before the record exists.
// PhotoSection: view / add / delete photos on an existing record.

import { useEffect, useRef, useState } from 'react'
import { listPhotos, uploadPhoto, deletePhoto, type PhotoLinks } from '../lib/photos'
import type { Photo, PhotoType } from '../lib/types'
import { ErrorBanner, IconCamera, IconX, SectionHeader, Spinner } from './ui'

export function PhotoStager({
  label,
  files,
  onChange,
}: {
  label: string
  files: File[]
  onChange: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ios-gray2 text-ios-gray"
        >
          <IconCamera size={24} />
          <span className="text-[11px] font-medium">Add</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? [])
          if (chosen.length) onChange([...files, ...chosen])
          e.target.value = ''
        }}
      />
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
}

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
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = () => {
    listPhotos(links)
      .then((p) => { setPhotos(p); setErr('') })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [links.movement_id, links.return_id, links.booking_id, links.vehicle_id])

  async function add(files: File[]) {
    setBusy(true)
    setErr('')
    try {
      for (const f of files) await uploadPhoto(f, filterType ?? defaultType, links, staffId)
      reload()
    } catch (e) {
      // Surface the failure — a silently-dropped before/after photo is a real problem.
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
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ios-gray2 text-ios-gray disabled:opacity-50"
            >
              {busy ? <Spinner /> : <IconCamera size={24} />}
              <span className="text-[11px] font-medium">{busy ? '' : 'Add'}</span>
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const chosen = Array.from(e.target.files ?? [])
            if (chosen.length) add(chosen)
            e.target.value = ''
          }}
        />
      </div>

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black" onClick={() => setViewer(null)}>
          <img src={viewer.url} alt="" className="min-h-0 flex-1 object-contain" />
          <div className="pb-safe flex items-center justify-between p-4">
            <button type="button" className="text-[17px] font-semibold text-white" onClick={() => setViewer(null)}>
              Close
            </button>
            <button
              type="button"
              className="text-[17px] font-semibold text-ios-red"
              onClick={(e) => {
                e.stopPropagation()
                remove(viewer)
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
