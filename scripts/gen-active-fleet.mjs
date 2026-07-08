// Regenerate src/data/activeFleet.ts from a plain fleet list.
//
// Input: a text file with one vehicle per line, rego as the first token
//   (e.g. "1CG1AA MAZDA-CX-5-2012-..." or just "1CG1AA"). Non-rego lines are
//   ignored. This mirrors the format of ~/Downloads/fleet.txt.
//
// Usage:  node scripts/gen-active-fleet.mjs <path-to-fleet-list>
//   e.g.  node scripts/gen-active-fleet.mjs ~/Downloads/fleet.txt
//
// The Cars screen uses this set to scope its default view to the live fleet.
// It never mutates vehicle records — purely a client-side display filter.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/gen-active-fleet.mjs <path-to-fleet-list>')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '../src/data/activeFleet.ts')

const set = new Set()
for (const line of readFileSync(input, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t) continue
  const rego = norm(t.split(/\s+/)[0])
  if (rego) set.add(rego)
}
const arr = [...set].sort()

const body =
  `// AUTO-GENERATED from the active-fleet list (~/Downloads/fleet.txt).\n` +
  `// The active fleet the business currently operates. Used to scope the Cars\n` +
  `// screen to the live fleet without mutating any vehicle records.\n` +
  `// To refresh: re-run scripts/gen-active-fleet.mjs against an updated fleet export.\n\n` +
  `export const ACTIVE_FLEET_REGOS: ReadonlySet<string> = new Set([\n` +
  arr.map((r) => `  ${JSON.stringify(r)},`).join('\n') +
  `\n])\n\n` +
  `export const isActiveFleet = (rego: string): boolean =>\n` +
  `  ACTIVE_FLEET_REGOS.has(rego.toUpperCase().replace(/[^A-Z0-9]/g, ''))\n`

writeFileSync(outPath, body)
console.log(`wrote ${outPath} with ${arr.length} unique regos`)
