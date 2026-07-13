// Reclassify mislabeled CUSTOMER cars (ours -> theirs) left by the original import.
//
//   Dry run (lists what WOULD flip, no writes):  npm run reclassify:dry
//   Live   (flips is_company_car -> false):       npm run reclassify
//
// A car is the CUSTOMER's (not ours) when the old import flagged it company BUT:
//   - it is NOT in our active-fleet list (the tagged, current fleet), AND
//   - it appears as a customer car coming IN (cars_in_rego), AND
//   - it was NEVER returned to us (never a returned_rego — a returned rego is OUR
//     courtesy car coming back, i.e. proven ours).
// Only the is_company_car boolean changes — make/model/vehicle_type/status untouched.
// Any car with a live CityTag is skipped so location tracking is never affected.

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const DRY = process.argv.includes('--dry-run')
const STRICT = process.argv.includes('--strict') // only flip cars whose FIRST movement was cars_in
const normRego = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const here = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.'); process.exit(1) }
const { createClient } = await import('@supabase/supabase-js')
const db = createClient(url, key, { auth: { persistSession: false } })

// --- active-fleet regos (definitely ours) parsed from src/data/activeFleet.ts ---
const fleetSrc = readFileSync(resolve(here, '../src/data/activeFleet.ts'), 'utf8')
const activeFleet = new Set()
for (const m of fleetSrc.matchAll(/"([A-Z0-9]{4,9})"/g)) activeFleet.add(m[1])
console.log('Active-fleet regos:', activeFleet.size)

// --- paged fetch (PostgREST caps 1000 rows/request) ---
async function all(table, columns) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order('id').range(from, from + 999)
    if (error) { console.error(`${table}: ${error.message}`); process.exit(1) }
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

// --- roles + earliest-appearance from movements + returns ---
const carsIn = new Set(), returned = new Set()
const firstRole = new Map() // rego -> { t, role }  (role at its earliest movement)
const ts = (m) => {
  const v = m.moved_at || m.movement_date
  if (!v) return Infinity
  const n = Date.parse(String(v).length === 10 ? `${v}T12:00:00Z` : v)
  return Number.isNaN(n) ? Infinity : n
}
for (const m of await all('vehicle_movements', 'cars_in_rego,cars_out_rego,moved_at,movement_date')) {
  const t = ts(m)
  const note = (rego, role) => { if (!rego) return; const c = firstRole.get(rego); if (!c || t < c.t) firstRole.set(rego, { t, role }) }
  if (m.cars_in_rego) carsIn.add(m.cars_in_rego)
  note(m.cars_in_rego, 'in')
  note(m.cars_out_rego, 'out')
}
for (const r of await all('vehicle_returns', 'returned_rego')) if (r.returned_rego) returned.add(r.returned_rego)
console.log('Regos seen as cars_in:', carsIn.size, '| as returned (ours):', returned.size)

// --- candidates: company car, not active fleet, came in, never returned to us ---
const vehicles = await all('vehicles', 'rego,make,model,is_company_car')
let candidates = vehicles.filter((v) =>
  v.is_company_car && !activeFleet.has(v.rego) && carsIn.has(v.rego) && !returned.has(v.rego))
console.log('Candidates (company + not-active-fleet + cars_in + never-returned):', candidates.length)

// Chronology: a customer's car comes IN first; a lent courtesy car goes OUT first.
for (const v of candidates) { const f = firstRole.get(v.rego); v._first = f?.role ?? '?'; v._dated = f && f.t !== Infinity }
const firstIn = candidates.filter((v) => v._first === 'in')
const firstOut = candidates.filter((v) => v._first === 'out')
const noDate = candidates.filter((v) => !v._dated)
console.log(`First appearance → cars_in (clearly theirs): ${firstIn.length} | cars_out (maybe old courtesy): ${firstOut.length} | no usable date: ${noDate.length}`)
if (STRICT) { candidates = firstIn; console.log(`STRICT mode: flipping only the ${candidates.length} that came in first.`) }

// --- tracking safety: skip any candidate that actually has a live CityTag ---
try {
  const res = await fetch('https://in-n-out-ten.vercel.app/api/citytag')
  const j = await res.json()
  const tagged = new Set((j.devices || []).map((d) => normRego(d.rego)))
  const before = candidates.length
  candidates = candidates.filter((v) => !tagged.has(v.rego))
  console.log(`CityTag devices: ${tagged.size}. Excluded ${before - candidates.length} tagged candidate(s).`)
} catch (e) {
  console.warn('WARN: could not fetch the CityTag list to double-check tags —', String(e))
  console.warn('  (candidates are already outside the active fleet, so none should be tagged.)')
}

candidates.sort((a, b) => a.rego.localeCompare(b.rego))
console.log(`\n=== ${candidates.length} cars would be reclassified OURS -> CUSTOMER ===`)
for (const v of candidates) console.log(`  ${v.rego}  ${([v.make, v.model].filter(Boolean).join(' ') || '(no make)').padEnd(20)} [first: ${v._first}${v._dated ? '' : ', no date'}]`)

if (DRY) { console.log('\nDry run — no writes. Re-run without --dry-run to apply.'); process.exit(0) }

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
let done = 0
for (const part of chunk(candidates.map((v) => v.rego), 200)) {
  const { error } = await db.from('vehicles').update({ is_company_car: false }).in('rego', part)
  if (error) console.error('update error:', error.message)
  else done += part.length
}
console.log(`\nDone. Reclassified ${done} cars to customer (is_company_car=false). Make/model untouched.`)
