// All Supabase reads/writes live here so screens stay simple.
// Every function throws on error — screens catch and show the message.

import { supabase } from './supabase'
import { normRego, normPhone, startOfTodayISO, endOfTodayISO, localDateOf, localTimeOf, todayLocalDate } from './utils'
import type {
  Activity, AuditLog, Booking, DashboardStats, Movement, RegoConflict,
  Return, SearchResults, StaffUser, Vehicle,
} from './types'

function must<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  return data as T
}

// ---------------------------------------------------------------- vehicles

export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase.from('vehicles').select('*').order('rego')
  return must(data, error)
}

export async function getVehicleByRego(rego: string): Promise<Vehicle | null> {
  const { data, error } = await supabase.from('vehicles').select('*').eq('rego', normRego(rego)).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function updateVehicle(id: string, patch: Partial<Vehicle>, staffId: string): Promise<void> {
  const { error } = await supabase.from('vehicles').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  void staffId
}

/** Find-or-create a vehicle row for a rego typed by staff. */
export async function ensureVehicle(rego: string, fields: Partial<Vehicle> = {}): Promise<Vehicle> {
  const clean = normRego(rego)
  const existing = await getVehicleByRego(clean)
  if (existing) return existing
  const { data, error } = await supabase
    .from('vehicles')
    .insert({ rego: clean, rego_raw: rego, status: 'unknown', ...fields })
    .select('*')
    .single()
  return must(data, error)
}

export async function setVehicleStatusByRego(rego: string, status: Vehicle['status']): Promise<void> {
  const { error } = await supabase.from('vehicles').update({ status }).eq('rego', normRego(rego))
  if (error) throw new Error(error.message)
}

/** Free a returned car, but never override an explicit 'repair' hold. */
async function freeVehicleAfterReturn(rego: string): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .update({ status: 'available' })
    .eq('rego', normRego(rego))
    .neq('status', 'repair')
  if (error) throw new Error(error.message)
}

// -------------------------------------------------------------- customers

export async function ensureCustomer(name: string, mobile: string): Promise<string | null> {
  const driver_name = name.trim()
  const mobile_number = normPhone(mobile)
  if (!driver_name && !mobile_number) return null
  // Dedupe only on an exact (name, mobile) match. Previously an empty name fell back
  // to ilike '%', which cross-linked every nameless record sharing a mobile to a
  // random existing customer. Require a real name before reusing a row.
  if (driver_name) {
    const { data } = await supabase
      .from('customers')
      .select('id')
      .ilike('driver_name', driver_name)
      .eq('mobile_number', mobile_number)
      .limit(1)
      .maybeSingle()
    if (data) return data.id
  }
  const { data: created, error } = await supabase
    .from('customers')
    .insert({ driver_name, mobile_number })
    .select('id')
    .single()
  return must(created, error).id
}

// -------------------------------------------------------------- movements

export interface NewMovementInput {
  driver_name: string
  driver_phone: string
  cars_in_rego: string
  cars_out_rego: string
  purpose: string
  moved_at: string // ISO
  notes: string
  staffId: string
}

export async function createMovement(input: NewMovementInput): Promise<Movement> {
  const carsIn = normRego(input.cars_in_rego)
  const carsOut = normRego(input.cars_out_rego)
  const customerId = await ensureCustomer(input.driver_name, input.driver_phone)
  let carsOutVehicleId: string | null = null
  if (carsIn) await ensureVehicle(carsIn, {})
  if (carsOut) {
    const v = await ensureVehicle(carsOut, { is_company_car: true })
    carsOutVehicleId = v.id
  }
  const { data, error } = await supabase
    .from('vehicle_movements')
    .insert({
      customer_id: customerId,
      driver_name: input.driver_name.trim(),
      driver_phone: normPhone(input.driver_phone),
      cars_in_rego: carsIn,
      cars_in_rego_raw: input.cars_in_rego,
      cars_out_rego: carsOut,
      cars_out_rego_raw: input.cars_out_rego,
      cars_out_vehicle_id: carsOutVehicleId,
      purpose: input.purpose,
      purpose_raw: input.purpose,
      moved_at: input.moved_at,
      movement_date: localDateOf(input.moved_at),
      movement_time: localTimeOf(input.moved_at),
      status: 'active',
      notes: input.notes,
      created_by: input.staffId,
      updated_by: input.staffId,
    })
    .select('*')
    .single()
  const movement = must(data, error)
  // The movement is the source of truth. If the derived vehicle-status write fails
  // (e.g. flaky network) don't throw — the record is saved, and a failed throw here
  // would make the caller retry and create a DUPLICATE movement.
  if (carsOut) await setVehicleStatusByRego(carsOut, 'out').catch(() => {})
  return movement
}

export async function getMovement(id: string): Promise<Movement> {
  const { data, error } = await supabase.from('vehicle_movements').select('*').eq('id', id).single()
  return must(data, error)
}

export async function updateMovement(id: string, patch: Partial<Movement>, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('vehicle_movements')
    .update({ ...patch, updated_by: staffId })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listMovements(opts: { status?: Movement['status']; limit?: number } = {}): Promise<Movement[]> {
  let q = supabase.from('vehicle_movements').select('*')
  if (opts.status) q = q.eq('status', opts.status)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 50)
  return must(data, error)
}

/** The active movement that sent this rego out, if any (for return matching + warnings). */
export async function findActiveMovementByRego(rego: string): Promise<Movement | null> {
  const { data, error } = await supabase
    .from('vehicle_movements')
    .select('*')
    .eq('cars_out_rego', normRego(rego))
    .eq('status', 'active')
    .order('moved_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/** Everything staff should be warned about before giving this car out. */
export async function getRegoConflicts(rego: string): Promise<RegoConflict> {
  const clean = normRego(rego)
  const [vehicle, activeMovement, bookingsRes] = await Promise.all([
    getVehicleByRego(clean),
    findActiveMovementByRego(clean),
    supabase
      .from('bookings')
      .select('*')
      .eq('vehicle_rego', clean)
      .in('status', ['booked', 'active'])
      .order('start_at'),
  ])
  if (bookingsRes.error) throw new Error(bookingsRes.error.message)
  return { vehicle, activeMovement, bookings: bookingsRes.data ?? [] }
}

// ---------------------------------------------------------------- returns

export interface NewReturnInput {
  driver_name: string
  mobile_number: string
  returned_rego: string
  returned_at: string // ISO
  bond_status: string
  notes: string
  staffId: string
}

/** Records the return; links + closes the matching active movement; frees the vehicle. */
export async function createReturn(input: NewReturnInput): Promise<{ ret: Return; matchedMovement: Movement | null }> {
  const rego = normRego(input.returned_rego)
  const matchedMovement = rego ? await findActiveMovementByRego(rego) : null
  const customerId = await ensureCustomer(input.driver_name, input.mobile_number)
  const vehicle = rego ? await ensureVehicle(rego, { is_company_car: true }) : null
  const { data, error } = await supabase
    .from('vehicle_returns')
    .insert({
      movement_id: matchedMovement?.id ?? null,
      customer_id: customerId,
      returned_vehicle_id: vehicle?.id ?? null,
      returned_rego: rego,
      returned_rego_raw: input.returned_rego,
      driver_name: input.driver_name.trim(),
      driver_name_raw: input.driver_name,
      mobile_number: normPhone(input.mobile_number),
      mobile_number_raw: input.mobile_number,
      returned_at: input.returned_at,
      return_date: localDateOf(input.returned_at),
      return_time: localTimeOf(input.returned_at),
      bond_status: input.bond_status,
      notes: input.notes,
      created_by: input.staffId,
      updated_by: input.staffId,
    })
    .select('*')
    .single()
  const ret = must(data, error)
  // Side-effects after the return row exists are best-effort: the return is the
  // source of truth, so a failure here must not make the caller retry (duplicate row).
  try {
    if (matchedMovement) await updateMovement(matchedMovement.id, { status: 'returned' }, input.staffId)
    if (rego) {
      await freeVehicleAfterReturn(rego)
      await completeBookingsForRego(rego, input.staffId) // close any active booking on this car
    }
  } catch {
    /* best-effort reconciliation; record is safely saved */
  }
  return { ret, matchedMovement }
}

/** When a car comes back, mark any still-open booking on it completed. */
async function completeBookingsForRego(rego: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'completed', updated_by: staffId })
    .eq('vehicle_rego', normRego(rego))
    .eq('status', 'active')
  if (error) throw new Error(error.message)
}

export async function getReturn(id: string): Promise<Return> {
  const { data, error } = await supabase.from('vehicle_returns').select('*').eq('id', id).single()
  return must(data, error)
}

export async function updateReturn(id: string, patch: Partial<Return>, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('vehicle_returns')
    .update({ ...patch, updated_by: staffId })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listReturns(limit = 50): Promise<Return[]> {
  const { data, error } = await supabase
    .from('vehicle_returns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return must(data, error)
}

/** All returns for one rego (newest first) — per-vehicle return history. */
export async function listReturnsByRego(rego: string): Promise<Return[]> {
  const { data, error } = await supabase
    .from('vehicle_returns')
    .select('*')
    .eq('returned_rego', normRego(rego))
    .order('created_at', { ascending: false })
    .limit(100)
  return must(data, error)
}

// ----------------------------------------------------------------- today

/** Movements recorded today — drives the "Cars out today" / "Customer cars in" views. */
export async function listTodaysMovements(): Promise<Movement[]> {
  const { data, error } = await supabase
    .from('vehicle_movements')
    .select('*')
    .gte('created_at', startOfTodayISO())
    .order('created_at', { ascending: false })
    .limit(500)
  return must(data, error)
}

/** Returns recorded today (entered today, or dated today) — drives "Returned today". */
export async function listTodaysReturns(): Promise<Return[]> {
  const { data, error } = await supabase
    .from('vehicle_returns')
    .select('*')
    .or(`created_at.gte.${startOfTodayISO()},return_date.eq.${todayLocalDate()}`)
    .order('created_at', { ascending: false })
    .limit(500)
  return must(data, error)
}

// --------------------------------------------------------------- bookings

export interface NewBookingInput {
  vehicle_rego: string
  booking_name: string
  booking_mobile: string
  start_at: string
  expected_return_at: string | null
  purpose: string
  notes: string
  staffId: string
}

export async function createBooking(input: NewBookingInput): Promise<Booking> {
  const rego = normRego(input.vehicle_rego)
  const vehicle = rego ? await ensureVehicle(rego, { is_company_car: true }) : null
  const customerId = await ensureCustomer(input.booking_name, input.booking_mobile)
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      vehicle_id: vehicle?.id ?? null,
      vehicle_rego: rego,
      customer_id: customerId,
      booking_name: input.booking_name.trim(),
      booking_mobile: normPhone(input.booking_mobile),
      start_at: input.start_at,
      expected_return_at: input.expected_return_at,
      purpose: input.purpose,
      status: 'booked',
      notes: input.notes,
      created_by: input.staffId,
      updated_by: input.staffId,
    })
    .select('*')
    .single()
  const booking = must(data, error)
  // Reflect the reservation on the availability screen — but never override a car
  // that is currently out or in repair.
  if (rego) {
    await supabase
      .from('vehicles')
      .update({ status: 'booked' })
      .eq('rego', rego)
      .in('status', ['available', 'unknown'])
      .then(() => {}, () => {})
  }
  return booking
}

export async function getBooking(id: string): Promise<Booking> {
  const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single()
  return must(data, error)
}

export async function updateBooking(id: string, patch: Partial<Booking>, staffId: string): Promise<void> {
  const { error } = await supabase.from('bookings').update({ ...patch, updated_by: staffId }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listBookings(statuses: Booking['status'][] = ['booked', 'active']): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .in('status', statuses)
    .order('start_at')
  return must(data, error)
}

/** After a booking is cancelled, drop its car back to available IF nothing else holds
 * it (no active movement, no other open booking). Only ever downgrades a car that is
 * currently 'booked' — an out / repair / available car is left untouched. */
async function releaseVehicleIfOnlyBooked(rego: string): Promise<void> {
  const clean = normRego(rego)
  if (!clean) return
  const [movement, bookingsRes] = await Promise.all([
    findActiveMovementByRego(clean),
    supabase.from('bookings').select('id').eq('vehicle_rego', clean).in('status', ['booked', 'active']).limit(1),
  ])
  if (bookingsRes.error) throw new Error(bookingsRes.error.message)
  if (movement || (bookingsRes.data?.length ?? 0) > 0) return
  const { error } = await supabase
    .from('vehicles')
    .update({ status: 'available' })
    .eq('rego', clean)
    .eq('status', 'booked')
  if (error) throw new Error(error.message)
}

/** Cancel a booking and free its reserved car if it was only being held by this booking. */
export async function cancelBooking(id: string, staffId: string): Promise<void> {
  const booking = await getBooking(id)
  await updateBooking(id, { status: 'cancelled' }, staffId)
  // Best-effort: the cancellation is saved even if the vehicle reconciliation fails.
  try {
    await releaseVehicleIfOnlyBooked(booking.vehicle_rego)
  } catch {
    /* leave the vehicle status as-is; staff can fix it on the vehicle record */
  }
}

// -------------------------------------------------------------- dashboard

export async function getDashboardStats(): Promise<DashboardStats> {
  const today0 = startOfTodayISO()
  const today24 = endOfTodayISO()
  const today = todayLocalDate()
  const count = (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) =>
    Promise.resolve(q).then(({ count: c, error }) => {
      if (error) throw new Error(error.message)
      return c ?? 0
    })
  // 'Needs attention' counts only rows the Import Review screen can actually show
  // (movements + returns flagged needs_review), so the number matches that list.
  // Overdue bookings are surfaced separately on the Bookings tab with a red badge.
  const [carsOut, returnedToday, goingOutToday, availableCars, bookedCars, overdue, reviewM, reviewR] =
    await Promise.all([
      count(supabase.from('vehicle_movements').select('*', { count: 'exact', head: true }).eq('status', 'active').neq('cars_out_rego', '')),
      count(supabase.from('vehicle_returns').select('*', { count: 'exact', head: true }).eq('return_date', today)),
      count(supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'booked').gte('start_at', today0).lte('start_at', today24)),
      count(supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'available').eq('is_company_car', true)),
      count(supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'booked')),
      count(supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'active').lt('expected_return_at', new Date().toISOString())),
      count(supabase.from('vehicle_movements').select('*', { count: 'exact', head: true }).eq('needs_review', true)),
      count(supabase.from('vehicle_returns').select('*', { count: 'exact', head: true }).eq('needs_review', true)),
    ])
  return {
    carsOut,
    returnedToday,
    goingOutToday,
    availableCars,
    bookedCars,
    overdue,
    needsAttention: reviewM + reviewR,
  }
}

export async function recentActivity(limit = 15): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, staff_user_id, action, table_name, record_id, created_at')
    .neq('table_name', 'photos')
    .order('created_at', { ascending: false })
    .limit(limit)
  const logs = must(data, error) as AuditLog[]
  const staff = await listStaff()
  const nameOf = new Map(staff.map((s) => [s.id, s.full_name || s.email]))
  return logs.map((l) => ({
    id: l.id,
    staffName: l.staff_user_id ? (nameOf.get(l.staff_user_id) ?? 'Staff') : 'Import',
    action: l.action,
    table_name: l.table_name,
    record_id: l.record_id,
    created_at: l.created_at,
  }))
}

// ----------------------------------------------------------------- search

// A search term like "Nguyen, Sarah" or "(work)" would otherwise break PostgREST's
// or() logic-tree syntax (comma = separator, parens = grouping). Strip the
// structural characters; ilike stays fuzzy so results are unaffected.
const sanitizeLike = (t: string) => t.replace(/[(),\\"]/g, ' ').replace(/\s+/g, ' ').trim()

// Recognise a typed date so staff can search "16/03/2024" or "2024-03-16".
function termToISODate(t: string): string | null {
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return Number.isNaN(Date.parse(t)) ? null : t
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return null
  let day = parseInt(m[1], 10)
  let month = parseInt(m[2], 10)
  const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
  if (month > 12 && day <= 12) [day, month] = [month, day] // tolerate mm/dd
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const s = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return Number.isNaN(Date.parse(s)) ? null : s
}

export async function universalSearch(term: string): Promise<SearchResults> {
  const t = term.trim()
  if (!t) return { movements: [], returns: [], vehicles: [], bookings: [] }
  const clean = sanitizeLike(t)
  const like = `%${clean}%`
  const regoLike = `%${normRego(t)}%`
  // Only treat the term as a phone search when it has enough digits to be one.
  // A rego like "1WZ1BY" (or "ZZTEST2") yields just 1-3 digits; matching those
  // against phone columns (e.g. %2%) would return almost every record, so a
  // rego/name search must NOT hit the phone columns. Require >= 6 digits.
  const phoneDigits = normPhone(t)
  const phoneLike = phoneDigits.length >= 6 ? `%${phoneDigits}%` : null
  const isoDate = termToISODate(t)

  const movementOr = [
    `cars_in_rego.ilike.${regoLike}`, `cars_out_rego.ilike.${regoLike}`,
    `driver_name.ilike.${like}`,
    ...(phoneLike ? [`driver_phone.ilike.${phoneLike}`] : []),
    `client_details_raw.ilike.${like}`, `driver_collecting_raw.ilike.${like}`,
    `purpose.ilike.${like}`, `purpose_raw.ilike.${like}`, `notes.ilike.${like}`,
    `rego_raw.ilike.${regoLike}`,
    ...(isoDate ? [`movement_date.eq.${isoDate}`] : []),
  ].join(',')
  const returnOr = [
    `returned_rego.ilike.${regoLike}`, `driver_name.ilike.${like}`,
    ...(phoneLike ? [`mobile_number.ilike.${phoneLike}`] : []),
    `mobile_number_raw.ilike.${like}`,
    `notes.ilike.${like}`, `bond_status.ilike.${like}`, `driver_name_raw.ilike.${like}`,
    ...(isoDate ? [`return_date.eq.${isoDate}`] : []),
  ].join(',')

  const [m, r, v, b] = await Promise.all([
    supabase.from('vehicle_movements').select('*').or(movementOr).order('created_at', { ascending: false }).limit(30),
    supabase.from('vehicle_returns').select('*').or(returnOr).order('created_at', { ascending: false }).limit(30),
    supabase.from('vehicles').select('*').or(`rego.ilike.${regoLike},make.ilike.${like},model.ilike.${like}`).limit(20),
    supabase
      .from('bookings')
      .select('*')
      .or([
        `vehicle_rego.ilike.${regoLike}`, `booking_name.ilike.${like}`,
        ...(phoneLike ? [`booking_mobile.ilike.${phoneLike}`] : []),
        `purpose.ilike.${like}`, `notes.ilike.${like}`,
      ].join(','))
      .order('start_at', { ascending: false })
      .limit(20),
  ])
  return {
    movements: must(m.data, m.error),
    returns: must(r.data, r.error),
    vehicles: must(v.data, v.error),
    bookings: must(b.data, b.error),
  }
}

// ------------------------------------------------------------ import review

export async function listNeedsReview(): Promise<{ movements: Movement[]; returns: Return[] }> {
  const [m, r] = await Promise.all([
    supabase.from('vehicle_movements').select('*').eq('needs_review', true).order('created_at', { ascending: false }).limit(500),
    supabase.from('vehicle_returns').select('*').eq('needs_review', true).order('created_at', { ascending: false }).limit(500),
  ])
  return { movements: must(m.data, m.error), returns: must(r.data, r.error) }
}

/** Bulk-clear the review flag on every flagged movement + return. */
export async function markAllReviewed(staffId: string): Promise<void> {
  const [m, r] = await Promise.all([
    supabase.from('vehicle_movements').update({ needs_review: false, review_reason: '', updated_by: staffId }).eq('needs_review', true),
    supabase.from('vehicle_returns').update({ needs_review: false, review_reason: '', updated_by: staffId }).eq('needs_review', true),
  ])
  if (m.error) throw new Error(m.error.message)
  if (r.error) throw new Error(r.error.message)
}

export async function getRawImportRow(sourceSheet: string, sourceRow: number): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('raw_import_rows')
    .select('raw_json')
    .eq('source_sheet', sourceSheet)
    .eq('source_row', sourceRow)
    .maybeSingle()
  return (data?.raw_json as Record<string, unknown>) ?? null
}

// ------------------------------------------------------------------ staff

export async function listStaff(): Promise<StaffUser[]> {
  const { data, error } = await supabase.from('staff_users').select('*').order('full_name')
  return must(data, error)
}

export async function updateMyName(id: string, full_name: string): Promise<void> {
  const { error } = await supabase.from('staff_users').update({ full_name }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ------------------------------------------------------------------ audit

export async function historyForRecord(table: string, recordId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, staff_user_id, action, table_name, record_id, created_at')
    .eq('table_name', table)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(50)
  const logs = must(data, error) as AuditLog[]
  const staff = await listStaff()
  const nameOf = new Map(staff.map((s) => [s.id, s.full_name || s.email]))
  return logs.map((l) => ({
    id: l.id,
    staffName: l.staff_user_id ? (nameOf.get(l.staff_user_id) ?? 'Staff') : 'Import',
    action: l.action,
    table_name: l.table_name,
    record_id: l.record_id,
    created_at: l.created_at,
  }))
}

// ------------------------------------------------------------------ export

export async function fetchAllRows(table: 'vehicle_movements' | 'vehicle_returns' | 'vehicles' | 'bookings' | 'customers'): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  const page = 1000
  // A stable .order() is required — without it, .range() paging can drop or
  // duplicate rows across pages once a table exceeds 1000 rows.
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(from, from + page - 1)
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if (!data || data.length < page) break
  }
  return all
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    // Neutralise CSV formula injection: a leading =,+,-,@ makes Excel/Sheets execute
    // the cell. Prefix with a single quote so it's treated as text.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}
