// Imports Sheet22 + "Car return Sheet" from RETURN SHEET DATA.xlsx into Supabase.
//
//   Dry run (no database needed, writes preview + report locally):
//     npm run import:dry -- --file "/path/to/RETURN SHEET DATA.xlsx"
//   Live import (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env):
//     npm run import -- --file "/path/to/RETURN SHEET DATA.xlsx"
//   Re-import from scratch (deletes previously IMPORTED rows only):
//     npm run import -- --file "..." --force
//
// Only these two sheets are read; every other sheet in the workbook is ignored.

import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as XLSX from 'xlsx'
import {
  isEmptyRow, isHeaderRow, isClosingPurpose, parseSheet22Row, parseReturnRow, str,
} from './import-lib.mjs'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const fileArg = args[args.indexOf('--file') + 1]
const FILE = args.includes('--file') && fileArg ? fileArg : 'RETURN SHEET DATA.xlsx'
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'import-output')
const ACTIVE_WINDOW_DAYS = 60

// ---------------------------------------------------------------- parse

const wb = XLSX.read(readFileSync(FILE), { cellDates: false })
for (const required of ['Sheet22', 'Car return Sheet']) {
  if (!wb.Sheets[required]) {
    console.error(`Sheet "${required}" not found. Sheets present: ${wb.SheetNames.join(', ')}`)
    process.exit(1)
  }
}
const sheetRows = (name) =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null })

const rawOf = (name, i, row) => ({
  source_sheet: name,
  source_row: i + 1,
  raw_json: Object.fromEntries(row.map((v, c) => [XLSX.utils.encode_col(c), v]).filter(([, v]) => v !== null)),
})

function collectRows(name, parseFn) {
  const rows = sheetRows(name)
  // `raw` = candidate rows (linked to a record). `skippedRaw` = rows we skipped but
  // that still held content — preserved so the "never lose spreadsheet data" rule holds.
  const out = { candidates: [], raw: [], skippedRaw: [], skipped: { empty: 0, header: 0, no_content: 0 } }
  rows.forEach((row, i) => {
    if (i === 0) return // header
    if (isEmptyRow(row)) { out.skipped.empty++; return }
    if (isHeaderRow(row)) { out.skipped.header++; out.skippedRaw.push(rawOf(name, i, row)); return }
    const parsed = parseFn(row, i)
    // Rows with a stray date/space and nothing else are noise, not records.
    const hasContent = name === 'Sheet22'
      ? parsed.rego_raw || parsed.cars_in_rego || parsed.cars_out_rego || parsed.client_details_raw || parsed.purpose_raw
      : parsed.returned_rego || parsed.driver_name_raw || parsed.notes
    if (!hasContent) { out.skipped.no_content++; out.skippedRaw.push(rawOf(name, i, row)); return }
    out.candidates.push(parsed)
    out.raw.push(rawOf(name, i, row))
  })
  return out
}

const s22 = collectRows('Sheet22', parseSheet22Row)
const ret = collectRows('Car return Sheet', parseReturnRow)

// ------------------------------------------------- customers & vehicles

const customers = new Map() // key -> {driver_name, mobile_number}
function customerKey(name, phone) {
  const n = str(name).toUpperCase().replace(/\s+/g, ' ')
  if (!n && !phone) return ''
  return `${n}|${phone}`
}
function addCustomer(name, phone) {
  const key = customerKey(name, phone)
  if (!key) return ''
  if (!customers.has(key)) customers.set(key, { driver_name: str(name), mobile_number: phone || '' })
  return key
}

const vehicles = new Map() // rego -> {rego, rego_raw, make, model, is_company_car, seen_in, seen_out}
function addVehicle(rego, raw, { make = '', model = '', companyCar = false, seenIn = false, seenOut = false } = {}) {
  if (!rego) return
  if (!vehicles.has(rego)) {
    vehicles.set(rego, { rego, rego_raw: raw || rego, make: '', model: '', is_company_car: false, seen_in: 0, seen_out: 0 })
  }
  const v = vehicles.get(rego)
  if (make && !v.make) v.make = str(make)
  if (model && !v.model) v.model = str(model)
  if (companyCar) v.is_company_car = true
  if (seenIn) v.seen_in++
  if (seenOut) v.seen_out++
}

for (const m of s22.candidates) {
  m._customerKey = addCustomer(m.driver_name, m.driver_phone)
  addVehicle(m.cars_in_rego, m.cars_in_rego_raw, { make: m.make_raw, seenIn: true })
  addVehicle(m.cars_out_rego, m.cars_out_rego_raw, { companyCar: true, seenOut: true })
  for (const h of m._modelHints) if (h.rego) addVehicle(h.rego, h.rego, { model: h.model })
}
for (const r of ret.candidates) {
  r._customerKey = addCustomer(r.driver_name, r.mobile_number)
  addVehicle(r.returned_rego, r.returned_rego_raw, { make: r._makeHint, companyCar: true })
  for (const h of r._modelHints) if (h.rego) addVehicle(h.rego, h.rego, { model: h.model })
}

// ------------------------------------------- match returns to movements

// Movements that sent a company car out, indexed by rego, sorted by date.
const outsByRego = new Map()
s22.candidates.forEach((m, idx) => {
  if (m.cars_out_rego && !isClosingPurpose(m.purpose)) {
    if (!outsByRego.has(m.cars_out_rego)) outsByRego.set(m.cars_out_rego, [])
    outsByRego.get(m.cars_out_rego).push(idx)
  }
})
for (const list of outsByRego.values()) {
  list.sort((a, b) => str(s22.candidates[a].movement_date).localeCompare(str(s22.candidates[b].movement_date)))
}

let matched = 0
for (const r of ret.candidates) {
  r._movementIdx = null
  const list = outsByRego.get(r.returned_rego)
  if (!list || !r.return_date) continue
  // latest movement on/before the return date that isn't already returned
  for (let i = list.length - 1; i >= 0; i--) {
    const m = s22.candidates[list[i]]
    if (m._returnedBy === undefined && m.movement_date && m.movement_date <= r.return_date) {
      m._returnedBy = r.source_row
      r._movementIdx = list[i]
      matched++
      break
    }
  }
}

// ------------------------------------------------------ movement status

const today = new Date().toISOString().slice(0, 10)
const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
const flagReview = (rec, reason) => {
  rec.needs_review = true
  rec.review_reason = [rec.review_reason, reason].filter(Boolean).join('; ')
}
// A future date is a data-entry error (e.g. day/month transposed) — flag, never trust as active.
let futureDated = 0
for (const rec of [...s22.candidates, ...ret.candidates]) {
  const d = rec.movement_date ?? rec.return_date
  if (d && d > today) { flagReview(rec, `future date (${d}) — likely day/month swapped`); futureDated++ }
}
let markedActive = 0
for (const m of s22.candidates) {
  const future = m.movement_date && m.movement_date > today
  if (isClosingPurpose(m.purpose)) m.status = 'closed'
  else if (m._returnedBy !== undefined) m.status = 'returned'
  else if (!future && m.cars_out_rego && m.movement_date && m.movement_date >= activeCutoff && m.movement_date <= today) {
    m.status = 'active'
    flagReview(m, 'imported as possibly still out — please confirm')
    markedActive++
  } else m.status = 'closed'
}

// Vehicle status: company car still out -> 'out'; company car -> 'available'; customer car -> 'unknown'.
const outNow = new Set(s22.candidates.filter((m) => m.status === 'active' && m.cars_out_rego).map((m) => m.cars_out_rego))
for (const v of vehicles.values()) {
  v.status = v.is_company_car ? (outNow.has(v.rego) ? 'out' : 'available') : 'unknown'
}

// --------------------------------------------------------------- report

const bothRoles = [...vehicles.values()].filter((v) => v.seen_in > 0 && v.seen_out > 0)
const regoCounts = new Map()
for (const m of s22.candidates) for (const rg of [m.cars_in_rego, m.cars_out_rego]) if (rg) regoCounts.set(rg, (regoCounts.get(rg) || 0) + 1)
for (const r of ret.candidates) if (r.returned_rego) regoCounts.set(r.returned_rego, (regoCounts.get(r.returned_rego) || 0) + 1)
const duplicateRegos = [...regoCounts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])

const report = {
  generated_at: new Date().toISOString(),
  file: FILE,
  mode: DRY_RUN ? 'dry-run' : 'live',
  sheet22: {
    rows_imported: s22.candidates.length,
    rows_skipped: s22.skipped,
    needs_review: s22.candidates.filter((m) => m.needs_review).length,
    marked_active_for_confirmation: markedActive,
    matched_to_a_return: s22.candidates.filter((m) => m._returnedBy !== undefined).length,
  },
  car_return_sheet: {
    rows_imported: ret.candidates.length,
    rows_skipped: ret.skipped,
    needs_review: ret.candidates.filter((r) => r.needs_review).length,
    matched_to_movement: matched,
    could_not_match_to_movement: ret.candidates.length - matched,
  },
  future_dated_rows_flagged: futureDated,
  skipped_rows_preserved_raw: s22.skippedRaw.length + ret.skippedRaw.length,
  customers_created: customers.size,
  vehicles_created: vehicles.size,
  company_cars: [...vehicles.values()].filter((v) => v.is_company_car).length,
  vehicles_seen_as_both_customer_and_company_car: bothRoles.length,
  duplicate_regos_found: duplicateRegos.length,
  top_duplicate_regos: duplicateRegos.slice(0, 15).map(([rego, n]) => ({ rego, times_seen: n })),
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'import-report.json'), JSON.stringify(report, null, 2))
console.log('\n===== IMPORT REPORT =====')
console.log(JSON.stringify(report, null, 2))

if (DRY_RUN) {
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')))
  writeFileSync(join(OUT_DIR, 'import-preview.json'), JSON.stringify({
    customers: [...customers.values()],
    vehicles: [...vehicles.values()],
    movements: s22.candidates.map(clean),
    returns: ret.candidates.map(clean),
  }, null, 2))
  console.log(`\nDry run only — preview written to import-output/import-preview.json`)
  console.log('No database was touched. Run without --dry-run to import into Supabase.')
  process.exit(0)
}

// ----------------------------------------------------------- live import

const { createClient } = await import('@supabase/supabase-js')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('\nMissing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env — cannot run live import.')
  console.error('Copy .env.example to .env and fill in the values from your Supabase dashboard.')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const fail = (label, error) => {
  if (error) {
    console.error(`\nFAILED at ${label}:`, error.message)
    process.exit(1)
  }
}

async function batched(table, rows, select) {
  const out = []
  for (let i = 0; i < rows.length; i += 400) {
    const slice = rows.slice(i, i + 400)
    let q = db.from(table).insert(slice)
    if (select) q = q.select(select)
    const { data, error } = await q
    fail(`insert into ${table} (rows ${i}–${i + slice.length})`, error)
    if (select) out.push(...data)
  }
  return out
}

// Guard against double-import. --force does a FULL reset (see warning below) so the
// re-import can't duplicate customers/vehicles — only safe BEFORE staff start using it.
{
  const { count, error } = await db.from('raw_import_rows').select('*', { count: 'exact', head: true })
  fail('checking previous imports', error)
  if ((count ?? 0) > 0 && !FORCE) {
    console.error(`\nDatabase already contains ${count} imported rows.`)
    console.error('Re-run with --force to WIPE ALL records (movements, returns, bookings, vehicles,')
    console.error('customers, raw rows AND any attached photos) and import fresh. Only do this before')
    console.error('staff start entering data — it destroys app-created records too.')
    process.exit(1)
  }
  if ((count ?? 0) > 0 && FORCE) {
    console.log('--force: full reset — wiping all records and attached photos…')
    const nn = (q) => q.not('id', 'is', null)
    // FK-safe order: children before parents. photos/returns/movements cascade,
    // but delete explicitly so nothing (incl. app-created rows) survives to duplicate.
    fail('clearing photos', (await nn(db.from('photos').delete())).error)
    fail('clearing returns', (await nn(db.from('vehicle_returns').delete())).error)
    fail('clearing movements', (await nn(db.from('vehicle_movements').delete())).error)
    fail('clearing bookings', (await nn(db.from('bookings').delete())).error)
    fail('clearing raw rows', (await nn(db.from('raw_import_rows').delete())).error)
    fail('clearing vehicles', (await nn(db.from('vehicles').delete())).error)
    fail('clearing customers', (await nn(db.from('customers').delete())).error)
  }
}

console.log('\nImporting customers…')
const customerRows = [...customers.entries()].map(([k, c]) => ({ ...c, _key: k }))
const insertedCustomers = await batched('customers', customerRows.map(({ _key, ...c }) => c), 'id')
const customerIdByKey = new Map(customerRows.map((c, i) => [c._key, insertedCustomers[i].id]))

console.log('Importing vehicles…')
const { data: existingVehicles, error: evErr } = await db.from('vehicles').select('id, rego')
fail('fetching existing vehicles', evErr)
const vehicleIdByRego = new Map((existingVehicles ?? []).map((v) => [v.rego, v.id]))
const newVehicles = [...vehicles.values()].filter((v) => !vehicleIdByRego.has(v.rego))
  .map(({ seen_in, seen_out, ...v }) => v)
const insertedVehicles = await batched('vehicles', newVehicles, 'id, rego')
for (const v of insertedVehicles) vehicleIdByRego.set(v.rego, v.id)

console.log('Importing movements…')
const movementRows = s22.candidates.map((m) => {
  const { _customerKey, _modelHints, _returnedBy, ...row } = m
  return {
    ...row,
    customer_id: customerIdByKey.get(_customerKey) ?? null,
    cars_out_vehicle_id: vehicleIdByRego.get(m.cars_out_rego) ?? null,
  }
})
const insertedMovements = await batched('vehicle_movements', movementRows, 'id')

console.log('Importing returns…')
const returnRows = ret.candidates.map((r) => {
  const { _customerKey, _modelHints, _movementIdx, _purposeHint, _makeHint, ...row } = r
  return {
    ...row,
    customer_id: customerIdByKey.get(_customerKey) ?? null,
    returned_vehicle_id: vehicleIdByRego.get(r.returned_rego) ?? null,
    movement_id: r._movementIdx !== null ? insertedMovements[r._movementIdx].id : null,
  }
})
const insertedReturns = await batched('vehicle_returns', returnRows, 'id')

console.log('Preserving raw spreadsheet rows…')
const movementIdByRow = new Map(s22.candidates.map((m, i) => [`Sheet22:${m.source_row}`, insertedMovements[i].id]))
const returnIdByRow = new Map(ret.candidates.map((r, i) => [`Car return Sheet:${r.source_row}`, insertedReturns[i].id]))
// Candidate rows (linked) plus content-bearing skipped rows (unlinked) — so every
// spreadsheet row with any data is preserved verbatim, nothing silently dropped.
const rawRows = [...s22.raw, ...ret.raw, ...s22.skippedRaw, ...ret.skippedRaw].map((r) => {
  const linkedId = movementIdByRow.get(`${r.source_sheet}:${r.source_row}`) ?? returnIdByRow.get(`${r.source_sheet}:${r.source_row}`) ?? null
  return {
    ...r,
    linked_table: linkedId ? (r.source_sheet === 'Sheet22' ? 'vehicle_movements' : 'vehicle_returns') : '',
    linked_record_id: linkedId,
  }
})
await batched('raw_import_rows', rawRows)

console.log('Setting vehicle statuses…')
for (const status of ['out', 'available', 'unknown']) {
  const regos = [...vehicles.values()].filter((v) => v.status === status).map((v) => v.rego)
  for (let i = 0; i < regos.length; i += 200) {
    const { error } = await db.from('vehicles').update({ status }).in('rego', regos.slice(i, i + 200))
    fail(`updating vehicle status ${status}`, error)
  }
}

fail('writing import audit entry', (await db.from('audit_logs').insert({
  action: 'import', table_name: '*', record_id: FILE, after_json: report,
})).error)

console.log('\nDone. Import report saved to import-output/import-report.json')
console.log(`Movements: ${insertedMovements.length}, Returns: ${insertedReturns.length}, Vehicles: ${vehicleIdByRego.size}, Customers: ${insertedCustomers.length}`)
