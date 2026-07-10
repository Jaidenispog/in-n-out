// Fix car ownership — clear is_company_car on customer cars the legacy import mis-tagged.
//
// WHY: the importer flags ANY rego seen in Sheet22 "CARS OUT" or the Car return Sheet as a
// company car. Because staff swap the in/out columns when handing a repaired car back, a
// customer's own car lands in CARS OUT and gets wrongly tagged as fleet. This re-derives the
// REAL fleet from the Starr365 exports and clears the flag on customer cars only.
//
// It is conservative: it NEVER sets is_company_car=true, never touches a Starr365 fleet car,
// and only ever flips true -> false for cars it classifies as customer-owned.
//
//   Dry run (no DB needed — lists the target regos):
//     node scripts/fix-car-ownership.mjs --return "RETURN SHEET DATA.xlsx" --booking Bookinglist.xls --invoice Invoicelist.xls
//
//   Apply (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env):
//     node scripts/fix-car-ownership.mjs --return "..." --booking "..." --invoice "..." --apply
//
//   Options:
//     --include-maybe   also clear lower-confidence "out-only" customer cars (Tier 2).
//                       Leave OFF unless you've confirmed against a full active-fleet list.

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const args = process.argv.slice(2)
const has = (n) => args.includes(n)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const APPLY = has('--apply')
const INCLUDE_MAYBE = has('--include-maybe')
const RET = opt('--return'), BOOK = opt('--booking'), INV = opt('--invoice')
if (!RET || !BOOK || !INV) {
  console.error('Usage: --return <RETURN_SHEET.xlsx> --booking <Bookinglist.xls> --invoice <Invoicelist.xls> [--apply] [--include-maybe]')
  process.exit(1)
}

// A rego is a plate only if it has letters AND digits and is 4-8 chars (drops notes/names/blanks).
// "1PI3XZ_ECHO" -> "1PI3XZ".
const norm = (s) => String(s ?? '').toUpperCase().split('_')[0].replace(/[^A-Z0-9]/g, '')
const isPlate = (r) => r.length >= 4 && r.length <= 8 && /[A-Z]/.test(r) && /[0-9]/.test(r)

function purpose(raw) {
  const s = String(raw ?? '').toUpperCase()
  if (!s) return ''
  if (/RETURN/.test(s)) return 'RETURN'
  if (/PICK/.test(s) && /\b(HIS|HER|THEIR|OWN|REPAIRED|CUSTOMER|MY)\b/.test(s)) return 'PICKUP'
  if (/PICK/.test(s) && /(COURT|RENT|LOAN|REPLAC)/.test(s)) return 'COURTESY'
  if (/COURT/.test(s)) return 'COURTESY'
  if (/RENT|RENATL/.test(s)) return 'RENT'
  if (/SWAP/.test(s)) return 'SWAP'
  if (/TOW/.test(s)) return 'TOWED'
  if (/REPAIR|BROKEN|BREAK\s?DOWN|SERVIC|MECH/.test(s)) return 'REPAIRS'
  if (/PICK/.test(s)) return 'PICKUP'
  return 'OTHER'
}
const isClosing = (p) => p === 'RETURN' || p === 'PICKUP'

function sheet(path, name) {
  const wb = XLSX.read(readFileSync(path), { cellDates: false })
  const s = name ? wb.SheetNames.find((n) => n.trim().toLowerCase() === name) : wb.SheetNames[0]
  if (!s) { console.error(`Sheet "${name}" not found in ${path}. Sheets: ${wb.SheetNames.join(', ')}`); process.exit(1) }
  return XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, blankrows: false, defval: '' })
}

// ---- Authoritative fleet from Starr365 (cars we rent / invoice) ----
const fleet = new Set()
for (const r of sheet(BOOK).slice(1)) { const c = norm(r[0]); if (isPlate(c)) fleet.add(c) }
for (const r of sheet(INV).slice(1)) { const c = norm(r[2]); if (isPlate(c)) fleet.add(c) }

// ---- Classify plates from the return workbook ----
const V = new Map()
const get = (r) => (V.has(r) ? V.get(r) : (V.set(r, { rego: r, in: 0, out: 0, ret: 0, outCourtesy: 0, outClosing: 0 }), V.get(r)))
for (const row of sheet(RET, 'sheet22').slice(1)) {
  const ci = norm(row[3]), co = norm(row[4]); const p = purpose(row[6])
  if (isPlate(ci)) get(ci).in++
  if (isPlate(co)) {
    const v = get(co); v.out++
    if (p === 'COURTESY' || p === 'RENT' || p === 'SWAP') v.outCourtesy++
    if (isClosing(p)) v.outClosing++
  }
}
for (const row of sheet(RET, 'car return sheet').slice(1)) { const rr = norm(row[4]); if (isPlate(rr)) get(rr).ret++ }

const freq = (v) => v.in + v.out + v.ret
function cls(v) {
  if (fleet.has(v.rego)) return 'fleet'
  if (v.outCourtesy > 0 || freq(v) >= 4) return 'fleet'                 // courtesy car given out / heavily reused
  if (v.in > 0) return 'customer'                                       // came in for repair (Tier 1, high confidence)
  if (v.out > 0) return 'customer-maybe'                                // out-only, owner unclear (Tier 2)
  return 'other'
}
const cars = [...V.values()]
// Only cars the importer would have tagged company (seen in CARS OUT or returned) can be mis-tagged.
const wouldTag = (v) => v.out > 0 || v.ret > 0
const tier1 = cars.filter((v) => cls(v) === 'customer' && wouldTag(v)).map((v) => v.rego)
const tier2 = cars.filter((v) => cls(v) === 'customer-maybe' && wouldTag(v)).map((v) => v.rego)
const targets = [...new Set(INCLUDE_MAYBE ? [...tier1, ...tier2] : tier1)].sort()

console.log(`Starr365 fleet regos:                         ${fleet.size}`)
console.log(`Mis-tagged customer cars — Tier 1 (came in):  ${tier1.length}`)
console.log(`Mis-tagged — Tier 2 (out-only, low conf):     ${tier2.length}  ${INCLUDE_MAYBE ? '(INCLUDED)' : '(excluded — pass --include-maybe)'}`)
console.log(`Regos to clear is_company_car on:             ${targets.length}`)

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.log(`\nNo SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env — analysis only.`)
  console.log(`Target regos:\n${targets.join(' ')}`)
  process.exit(0)
}

const { createClient } = await import('@supabase/supabase-js')
const db = createClient(url, key, { auth: { persistSession: false } })

// Preview: how many targets are currently flagged company in the DB.
const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
let currentlyTagged = 0
for (const part of chunks(targets, 200)) {
  const { count, error } = await db.from('vehicles').select('*', { count: 'exact', head: true }).in('rego', part).eq('is_company_car', true)
  if (error) { console.error('read error:', error.message); process.exit(1) }
  currentlyTagged += count ?? 0
}
console.log(`\nOf those, currently is_company_car=true in the DB: ${currentlyTagged}`)

if (!APPLY) {
  console.log('\nDry run — no writes. Re-run with --apply to clear the flag on the above.')
  process.exit(0)
}

let cleared = 0
for (const part of chunks(targets, 200)) {
  const { data, error } = await db.from('vehicles').update({ is_company_car: false }).in('rego', part).eq('is_company_car', true).select('rego')
  if (error) { console.error('update error:', error.message); continue }
  cleared += data?.length ?? 0
}
console.log(`\nDone. Cleared is_company_car on ${cleared} customer vehicles.`)
