// Bulk-create staff logins for In N Out from a local CSV (email,name[,password]).
//
//   Dry run (shows what would be created, touches nothing):
//     node scripts/create-staff.mjs --dry-run --file staff.csv
//   Create the accounts (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env):
//     node scripts/create-staff.mjs --file staff.csv
//
// CSV format — one staff member per line (a header row "email,name" is optional):
//     jane@example.com,Jane Smith
//     sam@example.com,Sam Lee,ChosenPassw0rd!
// If the password column is omitted, a strong random one is generated and printed
// once at the end so you can hand it to each staff member. staff.csv is gitignored;
// nothing (emails, names, passwords) is ever written into the repo.
//
// Accounts are created already-confirmed, so staff can sign in immediately. The
// database trigger fills each person's profile name from the CSV's name column.

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const fileArg = args[args.indexOf('--file') + 1]
const FILE = args.includes('--file') && fileArg ? fileArg : 'staff.csv'

// Minimal CSV: split lines, split on comma, trim. Staff names with commas aren't
// expected, so quote handling is intentionally omitted to keep this simple.
function parseCsv(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const [email = '', name = '', password = ''] = t.split(',').map((s) => s.trim())
    if (!email || email.toLowerCase() === 'email') continue // skip header / blank
    rows.push({ email, name, password })
  }
  return rows
}

// 16 url-safe chars + a guaranteed upper/digit/symbol so it passes any policy.
const strongPassword = () =>
  randomBytes(14).toString('base64').replace(/[+/=]/g, '').slice(0, 16) + 'aA1!'

let text
try {
  text = readFileSync(FILE, 'utf8')
} catch {
  console.error(`Cannot read "${FILE}". Create a CSV with one "email,name" per line, or pass --file <path>.`)
  process.exit(1)
}

const staff = parseCsv(text)
if (!staff.length) {
  console.error(`No staff rows found in "${FILE}".`)
  process.exit(1)
}
console.log(`Found ${staff.length} staff row(s) in ${FILE}.`)

if (DRY_RUN) {
  for (const s of staff) console.log(`  would create  ${s.email}  (${s.name || 'no name'})`)
  console.log('\nDry run — nothing created. Re-run without --dry-run to create the accounts.')
  process.exit(0)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('\nMissing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env — cannot create accounts.')
  process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const db = createClient(url, key, { auth: { persistSession: false } })

const created = []
let skipped = 0
for (const s of staff) {
  const password = s.password || strongPassword()
  const { error } = await db.auth.admin.createUser({
    email: s.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: s.name },
  })
  if (error) {
    console.error(`  skip  ${s.email} — ${error.message}`)
    skipped++
    continue
  }
  created.push({ email: s.email, password: s.password ? '(as provided)' : password })
  console.log(`  ok    ${s.email}`)
}

console.log(`\nDone. Created ${created.length}, skipped ${skipped}.`)
if (created.length) {
  console.log('\nGive each person their sign-in details (shown once — not saved anywhere):')
  console.log('email,password')
  for (const c of created) console.log(`${c.email},${c.password}`)
  console.log('\nStaff sign in with these; they can change their display name in Settings → your name.')
}
