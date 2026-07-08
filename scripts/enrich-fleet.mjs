// Fill make/model on fleet vehicles that are still "Make unknown", from an active-fleet
// list. ONLY fills vehicles whose make is currently empty — never overwrites existing.
//
//   Dry run:  npm run enrich:dry -- /path/to/fleet.txt
//   Live:     npm run enrich     -- /path/to/fleet.txt
//
// Accepts the pasted active-fleet format (one car per line):
//   1<tab>1CG1AA<tab>---
//   12<tab>1CJ7AY<tab>TOYOTA-YARIS-2011-JTDJW923205179854
// i.e. optional row number, then REGO, then MAKE-MODEL-YEAR-VIN (or "---" if unknown).

import 'dotenv/config'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const FILE = args.find((a) => !a.startsWith('--')) || 'fleet.txt'
const normRego = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function parseFleet(text) {
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const toks = t.split(/\s+/)
    let i = /^\d+$/.test(toks[0]) ? 1 : 0 // skip a leading row number
    const rego = normRego(toks[i] || '')
    const blob = (toks[i + 1] || '').trim()
    if (!rego || rego.length < 4) continue
    if (!blob || /^-+$/.test(blob)) continue // "---" = unknown
    const parts = blob.split('-')
    const make = (parts[0] || '').trim()
    if (!make) continue
    let yearIdx = parts.findIndex((p) => /^\d{4}$/.test(p) || /^\d{1,2}\/\d{4}$/.test(p))
    if (yearIdx < 1) yearIdx = parts.length - 1 // no year found → assume last chunk is the VIN
    const model = parts.slice(1, yearIdx).filter(Boolean).join('-').trim()
    out.push({ rego, make, model })
  }
  return out
}

let text
try { text = readFileSync(FILE, 'utf8') } catch {
  console.error(`Cannot read "${FILE}". Save your active-fleet list there (or pass a path), or use a Starr365 Inventory export.`)
  process.exit(1)
}
const fleet = parseFleet(text)
console.log(`Parsed ${fleet.length} fleet rows with a make.`)
console.log('Samples:', fleet.slice(0, 5))
if (DRY) { console.log('\nDry run — no DB writes. Re-run without --dry-run to enrich.'); process.exit(0) }

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('\nMissing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.'); process.exit(1) }
const { createClient } = await import('@supabase/supabase-js')
const db = createClient(url, key, { auth: { persistSession: false } })

// Regos currently missing a make (the only ones we'll touch).
const emptyMake = new Set()
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('vehicles').select('rego').eq('make', '').order('rego').range(from, from + 999)
  if (error) { console.error(error.message); process.exit(1) }
  for (const v of data || []) emptyMake.add(v.rego)
  if (!data || data.length < 1000) break
}
console.log('Vehicles with empty make:', emptyMake.size)

const seen = new Set()
const toFill = fleet.filter((f) => emptyMake.has(f.rego) && !seen.has(f.rego) && seen.add(f.rego))
console.log('Will enrich:', toFill.length)

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
let done = 0
for (const part of chunk(toFill, 200)) {
  const payload = part.map((f) => ({ rego: f.rego, make: f.make, model: f.model }))
  const { error } = await db.from('vehicles').upsert(payload, { onConflict: 'rego' })
  if (error) console.error('upsert error:', error.message)
  else done += part.length
}
const remaining = (await db.from('vehicles').select('*', { count: 'exact', head: true }).eq('make', '')).count
console.log(`\nDone. Enriched ${done} vehicles. Empty-make remaining: ${remaining}.`)
