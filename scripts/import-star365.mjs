// Imports a Starr365 snapshot into In N Out:
//   1) enriches fleet vehicles (make / model / type, marks them company cars)
//   2) sets current status: cars "Checked In" -> out, rest of the fleet -> available
//   3) creates an active movement per current rental so staff see who has each car
//
//   Dry run:  npm run star365:dry -- "/path/UtilityReport.xls" "/path/Booking-list.xls"
//   Live:     npm run star365     -- "/path/UtilityReport.xls" "/path/Booking-list.xls"
//   Re-run is idempotent (movements de-duped on the Starr365 booking id). --force
//   removes previously-imported Starr365 movements first.
//
// The two files can be given in any order — they're identified by their headers.
// No Starr365 passwords/cookies/tokens are used or stored.

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const FORCE = args.includes('--force')
const files = args.filter((a) => !a.startsWith('--'))

const normRego = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const readSheet = (path) => {
  const wb = XLSX.read(readFileSync(path), { cellDates: false })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null })
}

// Identify which file is which by header content
let fleetRows = null, bookingRows = null
for (const f of files) {
  const rows = readSheet(f)
  const head = rows.slice(0, 3).flat().map((x) => String(x || '')).join('|')
  if (/CarNum/i.test(head)) fleetRows = rows
  else if (/Finish Date|Start Date|\bBooking\b/i.test(head)) bookingRows = rows
}

function parseFleet(rows) {
  if (!rows) return []
  const hi = rows.findIndex((r) => r && r.some((c) => /CarNum/i.test(String(c || ''))))
  const out = []
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r[0]) continue
    const rego = normRego(r[0]); if (!rego) continue
    out.push({ rego, type: String(r[1] || '').trim(), make: String(r[2] || '').trim(), model: String(r[3] || '').trim() })
  }
  return out
}
function parseBookings(rows) {
  if (!rows) return []
  const hi = rows.findIndex((r) => r && r.some((c) => /^Car$/i.test(String(c || '').trim())))
  const out = []
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r[0]) continue
    const rego = normRego(r[0]); if (!rego) continue
    const bk = String(r[2] || '')
    const m = bk.match(/^(.*?)\s*\((\d+)\)\s*$/)
    out.push({
      rego, regoRaw: String(r[0]).trim(),
      status: m ? m[1].trim() : bk.trim(),
      star365Id: m ? parseInt(m[2], 10) : null,
      client: String(r[4] || '').trim(),
      startText: String(r[5] || '').trim(),
      rent: r[7] != null && r[7] !== '' ? Number(r[7]) : null,
    })
  }
  return out
}
// "06 Jul 2026 16:18" -> ISO
const parseStart = (t) => { const d = new Date(t); return isNaN(d.getTime()) ? null : d }
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const localTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const fleet = parseFleet(fleetRows)
const rentals = parseBookings(bookingRows).filter((b) => /checked\s*in/i.test(b.status) && b.rego)
const outRegos = [...new Set(rentals.map((b) => b.rego))]
const fleetRegos = [...new Set(fleet.map((f) => f.rego))]
const availRegos = fleetRegos.filter((r) => !outRegos.includes(r))

console.log(`Fleet cars: ${fleet.length} | Checked-in rentals: ${rentals.length} | distinct cars out: ${outRegos.length}`)
console.log(`Rentals with unparseable start date: ${rentals.filter((b) => !parseStart(b.startText)).length}`)
console.log(`Rentals missing a Starr365 id: ${rentals.filter((b) => !b.star365Id).length}`)

if (DRY) {
  console.log('\nDRY RUN — no DB writes.')
  console.log('Fleet sample:', fleet.slice(0, 3))
  console.log('Rental sample (client redacted):', rentals.slice(0, 3).map((b) => ({ rego: b.rego, start: parseStart(b.startText)?.toISOString(), rent: b.rent, ref: b.star365Id })))
  process.exit(0)
}

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('\nMissing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1) }
const { createClient } = await import('@supabase/supabase-js')
const db = createClient(url, key, { auth: { persistSession: false } })
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const fail = (label, error) => { if (error) { console.error(`  ${label}: ${error.message}`); } }

// 1) enrich fleet vehicles (upsert only touches make/model/vehicle_type/is_company_car)
console.log('\nEnriching fleet vehicles…')
for (const part of chunk(fleet, 200)) {
  const payload = part.map((f) => ({ rego: f.rego, rego_raw: f.rego, make: f.make, model: f.model, vehicle_type: f.type, is_company_car: true }))
  fail('vehicles upsert', (await db.from('vehicles').upsert(payload, { onConflict: 'rego' })).error)
}

// 2) status: checked-in -> out, rest of fleet -> available (never override a 'repair' hold)
console.log('Setting vehicle statuses (out / available)…')
for (const part of chunk(outRegos, 100)) fail('set out', (await db.from('vehicles').update({ status: 'out' }).in('rego', part).neq('status', 'repair')).error)
for (const part of chunk(availRegos, 100)) fail('set available', (await db.from('vehicles').update({ status: 'available' }).in('rego', part).neq('status', 'repair')).error)

// 3) movements for current rentals (idempotent on source_sheet='Starr365' + source_row=id)
if (FORCE) { console.log('--force: clearing previous Starr365 movements…'); fail('clear', (await db.from('vehicle_movements').delete().eq('source_sheet', 'Starr365')).error) }
const existing = new Set()
{
  const { data } = await db.from('vehicle_movements').select('source_row').eq('source_sheet', 'Starr365')
  for (const r of data ?? []) existing.add(r.source_row)
}
// don't create a second "out" record for a car that already has an active movement (e.g. from the historical import)
const activeByRego = new Set()
for (const part of chunk(outRegos, 100)) {
  const { data } = await db.from('vehicle_movements').select('cars_out_rego').eq('status', 'active').in('cars_out_rego', part)
  for (const r of data ?? []) activeByRego.add(r.cars_out_rego)
}
const toInsert = []
for (const b of rentals) {
  if (b.star365Id && existing.has(b.star365Id)) continue
  if (activeByRego.has(b.rego)) continue
  const d = parseStart(b.startText)
  toInsert.push({
    driver_name: b.client, driver_phone: '',
    cars_in_rego: '', cars_out_rego: b.rego, cars_out_rego_raw: b.regoRaw,
    purpose: 'RENT', purpose_raw: `Starr365 ${b.status}`,
    moved_at: d ? d.toISOString() : null, movement_date: d ? localDate(d) : null, movement_time: d ? localTime(d) : '',
    status: 'active',
    notes: `Starr365 rental${b.rent != null ? ` · $${b.rent}/wk` : ''}${b.star365Id ? ` · ref ${b.star365Id}` : ''}`,
    source_sheet: 'Starr365', source_row: b.star365Id,
  })
  activeByRego.add(b.rego)
}
console.log(`Creating ${toInsert.length} rental movements (skipped ${rentals.length - toInsert.length} already-out / duplicates)…`)
for (const part of chunk(toInsert, 200)) fail('movements insert', (await db.from('vehicle_movements').insert(part)).error)

console.log(`\nDone. Fleet enriched: ${fleet.length}, out: ${outRegos.length}, available: ${availRegos.length}, movements created: ${toInsert.length}.`)
