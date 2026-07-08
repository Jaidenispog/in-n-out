import type { BookingStatus, MovementStatus, Purpose, VehicleStatus } from './types'

// "1pi3xz " -> "1PI3XZ"
export const normRego = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

export const normPhone = (s: string) => {
  let d = s.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('61')) d = '0' + d.slice(2)
  if (d.length === 9 && d.startsWith('4')) d = '0' + d
  return d
}

export const nowLocalInputValue = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16) // for <input type="datetime-local">
}

// Local (Melbourne) calendar parts of a UTC ISO timestamp. Used to store
// movement_date / movement_time so a 9am entry keeps today's date, not the UTC day.
export const localDateOf = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const localTimeOf = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const startOfTodayISO = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const endOfTodayISO = () => {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

// Today's date in local (Melbourne) terms as YYYY-MM-DD, for date-column comparisons.
export const todayLocalDate = () => localDateOf(new Date().toISOString())

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Human-readable span between two instants, e.g. "5 days", "3 months", "1 yr 2 mo". */
export function formatDuration(fromISO: string | null | undefined, toISO: string | null | undefined): string {
  if (!fromISO || !toISO) return ''
  const from = new Date(fromISO.length === 10 ? fromISO + 'T12:00:00' : fromISO).getTime()
  const to = new Date(toISO.length === 10 ? toISO + 'T12:00:00' : toISO).getTime()
  if (isNaN(from) || isNaN(to) || to < from) return ''
  const days = Math.round((to - from) / 86_400_000)
  if (days === 0) return 'same day'
  if (days === 1) return '1 day'
  if (days < 60) return `${days} days`
  const months = Math.round(days / 30.44)
  if (months < 24) return `${months} months`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem ? `${years} yr ${rem} mo` : `${years} yr`
}

// Status → badge tone (maps to ui.tsx <Badge tone=...>)
export type Tone = 'green' | 'red' | 'orange' | 'blue' | 'gray' | 'purple'

export const vehicleStatusTone: Record<VehicleStatus, Tone> = {
  available: 'green',
  out: 'red',
  booked: 'orange',
  repair: 'purple',
  unknown: 'gray',
}
export const vehicleStatusLabel: Record<VehicleStatus, string> = {
  available: 'Available',
  out: 'Out',
  booked: 'Booked',
  repair: 'In repair',
  unknown: 'Needs review',
}

export const movementStatusTone: Record<MovementStatus, Tone> = {
  active: 'red',
  returned: 'green',
  closed: 'gray',
}
export const movementStatusLabel: Record<MovementStatus, string> = {
  active: 'Out now',
  returned: 'Returned',
  closed: 'Closed',
}

export const bookingStatusTone: Record<BookingStatus, Tone> = {
  booked: 'orange',
  active: 'red',
  completed: 'gray',
  cancelled: 'gray',
}
// Spec vocabulary for the 4-state booking lifecycle (booked → picked up → returned).
export const bookingStatusLabel: Record<BookingStatus, string> = {
  booked: 'Booked',
  active: 'Picked up',
  completed: 'Returned',
  cancelled: 'Cancelled',
}

export const purposeTone: Record<string, Tone> = {
  RENT: 'blue',
  COURTESY: 'purple',
  REPAIRS: 'orange',
  TOWED: 'red',
  SWAP: 'blue',
  PICKUP: 'gray',
  RETURN: 'green',
  INTAKE: 'orange',
  OTHER: 'gray',
}

export const purposeLabel = (p: Purpose | string) =>
  p ? p.charAt(0) + p.slice(1).toLowerCase() : '—'
