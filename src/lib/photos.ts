// Photo capture: compress on-device, upload to the private 'photos' bucket,
// link to a movement / return / booking / vehicle.

import { supabase } from './supabase'
import type { Photo, PhotoType } from './types'

const MAX_DIM = 1600
const JPEG_QUALITY = 0.72

export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file // fail gracefully: upload the original
  }
}

export interface PhotoLinks {
  movement_id?: string
  return_id?: string
  booking_id?: string
  vehicle_id?: string
}

export async function uploadPhoto(
  file: File,
  photoType: PhotoType,
  links: PhotoLinks,
  staffId: string,
): Promise<Photo> {
  const blob = await compressImage(file)
  const owner = links.movement_id ?? links.return_id ?? links.booking_id ?? links.vehicle_id ?? 'misc'
  const path = `${owner}/${photoType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error: upErr } = await supabase.storage.from('photos').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (upErr) throw new Error(upErr.message)
  const { data, error } = await supabase
    .from('photos')
    .insert({
      movement_id: links.movement_id ?? null,
      return_id: links.return_id ?? null,
      booking_id: links.booking_id ?? null,
      vehicle_id: links.vehicle_id ?? null,
      photo_type: photoType,
      storage_path: path,
      uploaded_by: staffId,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function listPhotos(links: PhotoLinks): Promise<(Photo & { url: string })[]> {
  let q = supabase.from('photos').select('*')
  if (links.movement_id) q = q.eq('movement_id', links.movement_id)
  else if (links.return_id) q = q.eq('return_id', links.return_id)
  else if (links.booking_id) q = q.eq('booking_id', links.booking_id)
  else if (links.vehicle_id) q = q.eq('vehicle_id', links.vehicle_id)
  else return []
  const { data, error } = await q.order('uploaded_at')
  if (error) throw new Error(error.message)
  const photos = data ?? []
  if (!photos.length) return []
  const { data: signed, error: signErr } = await supabase.storage
    .from('photos')
    .createSignedUrls(photos.map((p) => p.storage_path), 3600)
  if (signErr) throw new Error(signErr.message)
  return photos.map((p, i) => ({ ...p, url: signed?.[i]?.signedUrl ?? '' }))
}

export async function deletePhoto(photo: Photo): Promise<void> {
  await supabase.storage.from('photos').remove([photo.storage_path])
  const { error } = await supabase.from('photos').delete().eq('id', photo.id)
  if (error) throw new Error(error.message)
}
