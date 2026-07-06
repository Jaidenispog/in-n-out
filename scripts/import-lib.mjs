// Pure parsing/normalising helpers for the RETURN SHEET DATA.xlsx import.
// Everything here is defensive: bad input returns nulls + reasons, never throws.

export const str = (v) => (v === null || v === undefined ? '' : String(v).trim())

// --- Rego -------------------------------------------------------------

// "1PI3XZ_ECHO" -> { rego: "1PI3XZ", modelHint: "ECHO" }; " 1xt5qi " -> { rego: "1XT5QI" }
export function normRego(value) {
  const raw = str(value)
  if (!raw) return { rego: '', modelHint: '', raw }
  let s = raw.toUpperCase()
  let modelHint = ''
  const underscore = s.indexOf('_')
  if (underscore > 0) {
    modelHint = s.slice(underscore + 1).replace(/[^A-Z0-9 ]/g, ' ').trim()
    s = s.slice(0, underscore)
  }
  s = s.replace(/[^A-Z0-9]/g, '')
  return { rego: s, modelHint, raw }
}

export const looksLikeRego = (s) =>
  /^[A-Z0-9]{4,7}$/.test(s) && /\d/.test(s) && /[A-Z]/.test(s)

// --- Dates ------------------------------------------------------------

// Excel 1900-epoch serial -> 'YYYY-MM-DD' (dates only; we treat serials as local dates).
// Sane window 1995..2035 — outside that it's a typo (the sheet contains 6685591).
export function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || !isFinite(serial)) return null
  const days = Math.floor(serial)
  if (days < 34700 || days > 49700) return null
  const ms = (days - 25569) * 86400000
  const d = new Date(ms)
  return d.toISOString().slice(0, 10)
}

// Day-first string dates: "23-02-2024", "16/03/2024", "22/9/25", "12//11/2025".
// 3-digit years ("16/03/204") are typos we refuse to guess -> null.
export function parseStringDate(value) {
  const raw = str(value)
  if (!raw) return null
  const compact = raw.replace(/\s/g, '')
  const m =
    compact.match(/^(\d{1,2})[/\-.]+(\d{1,2})[/\-.]+(\d{2,4})$/) ||
    // missing second separator: "25-052024", "13/072024"
    compact.match(/^(\d{1,2})[/\-.]+(\d{2})(\d{4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  let year = parseInt(m[3], 10)
  if (m[3].length === 3) return null
  if (year < 100) year += 2000
  if (year < 1995 || year > 2035) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

export function parseAnyDate(value) {
  if (typeof value === 'number') return excelSerialToDate(value)
  return parseStringDate(value)
}

// --- Times ------------------------------------------------------------

// Excel day-fraction -> "HH:MM"; strings like "12;35PM" -> "12:35"; junk -> '' (raw kept by caller).
export function parseAnyTime(value) {
  if (typeof value === 'number' && isFinite(value) && value >= 0 && value < 2) {
    const frac = value % 1
    const mins = Math.round(frac * 24 * 60)
    const h = Math.floor(mins / 60) % 24
    const m = mins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const raw = str(value).toUpperCase().replace(/;/g, ':')
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/)
  if (!m) return ''
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return ''
  if (m[3] === 'PM' && h < 12) h += 12
  if (m[3] === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// Melbourne UTC offset ('+10:00' AEST / '+11:00' AEDT) for a given YYYY-MM-DD.
// The spreadsheet times are Melbourne wall-clock; we stamp the correct instant
// so the app (which displays in Melbourne local time) shows the right day + time.
export function melbourneOffset(dateStr) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Australia/Melbourne',
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(`${dateStr}T00:00:00Z`))
    const tz = parts.find((p) => p.type === 'timeZoneName')
    const off = tz ? tz.value.replace('GMT', '') : ''
    return /^[+-]\d{2}:\d{2}$/.test(off) ? off : '+10:00'
  } catch {
    return '+10:00'
  }
}

// date 'YYYY-MM-DD' + time 'HH:MM' -> ISO timestamp carrying the Melbourne offset.
export function combineDateTime(date, time) {
  if (!date) return null
  return `${date}T${time || '12:00'}:00${melbourneOffset(date)}`
}

// --- Phones -----------------------------------------------------------

// AU numbers only: "0466689475", 466689475 (Excel ate the 0), "0401 550 990",
// "61412345678", landline "0398765432". Rejects non-phone digit strings (e.g. a
// date like 23-02-2024 -> "23022024") so we never fabricate a mobile number.
export function normalizePhone(value) {
  if (value === null || value === undefined) return ''
  let digits = String(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('61')) digits = '0' + digits.slice(2)
  if (digits.length === 9 && (digits.startsWith('4') || digits.startsWith('3'))) digits = '0' + digits
  // A valid AU number is 10 digits starting with 0 (02/03/04/07/08...).
  return /^0[234789]\d{8}$/.test(digits) ? digits : ''
}

// "ABDULLAH ZAIN 0466689475" -> { name: "ABDULLAH ZAIN", phone: "0466689475" }
export function splitNamePhone(value) {
  const raw = str(value)
  if (!raw) return { name: '', phone: '', raw }
  const phoneMatch = raw.match(/(\+?61\s?4[\d\s]{8,12}|04[\d\s]{8,11}|\b4\d{8}\b)/)
  let name = raw
  let phone = ''
  if (phoneMatch) {
    phone = normalizePhone(phoneMatch[0])
    name = raw.replace(phoneMatch[0], ' ')
  }
  name = name.replace(/[\s,/-]+$/g, '').replace(/^[\s,/-]+/g, '').replace(/\s{2,}/g, ' ').trim()
  return { name, phone, raw }
}

// --- Purpose ----------------------------------------------------------

// 753 distinct free-text purposes -> canonical buckets (raw always kept).
export function normalizePurpose(value) {
  const raw = str(value)
  if (!raw) return ''
  const s = raw.toUpperCase()
  // Explicit return of our car ends the transaction.
  if (/RETURN/.test(s)) return 'RETURN'
  // "Picked up his/their/own/repaired car" = customer collected THEIR car (closing).
  if (/PICK/.test(s) && /\b(HIS|HER|THEIR|OWN|REPAIRED|CUSTOMER|MY)\b/.test(s)) return 'PICKUP'
  // "Picked up courtesy/rental/loan car" = customer took OUR car — NOT a closing event.
  if (/PICK/.test(s) && /(COURT|RENT|LOAN|REPLAC)/.test(s)) {
    return /RENT|RENATL/.test(s) ? 'RENT' : 'COURTESY'
  }
  if (/SWAP/.test(s)) return 'SWAP'
  if (/TOW/.test(s)) return 'TOWED'
  if (/COURT|ACCIDENT|REPLACEMENT/.test(s)) return 'COURTESY' // incl. COURTSEY misspellings
  if (/REPAIR|SERVICE/.test(s)) return 'REPAIRS'
  if (/RENT|RENATL/.test(s)) return 'RENT'
  if (/BROKEN|BREAK\s?DOWN/.test(s)) return 'REPAIRS'
  if (/PICK/.test(s)) return 'PICKUP' // bare "picked up" -> customer took their car back
  return 'OTHER'
}

// A purpose that means the transaction ENDED (their car left / ours came back).
export const isClosingPurpose = (canonical) => canonical === 'RETURN' || canonical === 'PICKUP'

// --- Row classification -----------------------------------------------

export const isEmptyRow = (row) => row.every((c) => c === null || str(c) === '')

// Repeated header rows buried inside the data
const HEADER_WORDS = new Set([
  'REGO', 'DRIVERS', 'MOBILE NUMBER', 'DATE RETURN', 'TIME', 'BOND STATUS',
  'MAKE', 'MODEL', 'REASON / ISSUE', 'CARS IN', 'CARS OUT', 'CLIENT DETAILS',
])
export function isHeaderRow(row) {
  const hits = row.filter((c) => HEADER_WORDS.has(str(c).toUpperCase())).length
  return hits >= 2
}

// --- Sheet22 row -> movement candidate ---------------------------------

export function parseSheet22Row(row, rowIndex) {
  const [colDate, colRego, colTime, colIn, colOut, colMake, colPurpose, colClient, colDriver, colSigned, colExtra] = row
  const reasons = []

  const movementDate = parseAnyDate(colDate)
  if (!movementDate && str(colDate)) reasons.push('unreadable date: ' + str(colDate))
  if (!movementDate && !str(colDate)) reasons.push('missing date')

  const time = parseAnyTime(colTime)
  const rego = normRego(colRego)
  const carsIn = normRego(colIn)
  const carsOut = normRego(colOut)
  if (!rego.rego && !carsIn.rego && !carsOut.rego) reasons.push('no rego anywhere in row')

  const client = splitNamePhone(colClient)
  const purposeRaw = str(colPurpose)
  const purpose = normalizePurpose(purposeRaw)
  const extra = str(colExtra)

  return {
    source_sheet: 'Sheet22',
    source_row: rowIndex + 1, // 1-based like Excel
    movement_date: movementDate,
    movement_time: time || str(colTime),
    moved_at: combineDateTime(movementDate, time),
    rego_raw: str(colRego),
    cars_in_rego: carsIn.rego,
    cars_in_rego_raw: carsIn.raw,
    cars_out_rego: carsOut.rego,
    cars_out_rego_raw: carsOut.raw,
    make_raw: str(colMake),
    purpose,
    purpose_raw: purposeRaw,
    client_details_raw: client.raw,
    driver_name: client.name,
    driver_phone: client.phone,
    driver_collecting_raw: str(colDriver),
    signed_off: str(colSigned),
    notes: extra ? `[Imported extra column] ${extra}` : '',
    needs_review: reasons.length > 0,
    review_reason: reasons.join('; '),
    _modelHints: [rego, carsIn, carsOut].filter((r) => r.modelHint).map((r) => ({ rego: r.rego, model: r.modelHint })),
  }
}

// --- Car return Sheet row -> return candidate ---------------------------

const TYPE_WORDS = /^(RENTAL|RENATL|COURTESY|COURTSEY|BLANK|BLANK,.*|rental|courtsey)$/i

export function parseReturnRow(row, rowIndex) {
  const [colA, colB, colDrivers, colMobile, colRego, colMake, colType, colNotes, colDate, colTime, colBond] = row
  const reasons = []

  const returnDate = parseAnyDate(colDate)
  if (!returnDate && str(colDate)) reasons.push('unreadable date: ' + str(colDate))
  if (!returnDate && !str(colDate)) reasons.push('missing date')

  const time = parseAnyTime(colTime)
  const rego = normRego(colRego)
  if (!rego.rego) reasons.push('missing rego')

  // Driver name lives in C, but 81 rows have it in A/B instead.
  const driverRaw = str(colDrivers) || str(colA) || str(colB)
  const driver = splitNamePhone(driverRaw)
  const mobile = normalizePhone(colMobile) || driver.phone

  // Col G is either a type word (RENTAL/COURTESY) or a rego (the swap car) or junk.
  const typeVal = str(colType)
  const noteParts = []
  let purposeHint = ''
  if (typeVal) {
    if (TYPE_WORDS.test(typeVal)) purposeHint = normalizePurpose(typeVal)
    else if (looksLikeRego(typeVal.toUpperCase().replace(/[^A-Z0-9]/g, ''))) noteParts.push(`Swap/related car: ${typeVal}`)
    else noteParts.push(typeVal)
  }
  if (str(colNotes)) noteParts.push(str(colNotes))
  const makeHint = str(colMake)
  if (makeHint && !/^(MAKE|MODEL|hhh+)/i.test(makeHint)) {
    // keep make info with the vehicle, not the note — handled by caller via _modelHints
  }

  return {
    source_sheet: 'Car return Sheet',
    source_row: rowIndex + 1,
    return_date: returnDate,
    return_time: time || str(colTime),
    returned_at: combineDateTime(returnDate, time),
    returned_rego: rego.rego,
    returned_rego_raw: rego.raw,
    driver_name: driver.name,
    driver_name_raw: driverRaw,
    mobile_number: mobile,
    mobile_number_raw: str(colMobile),
    bond_status: str(colBond),
    notes: noteParts.join(' | '),
    needs_review: reasons.length > 0,
    review_reason: reasons.join('; '),
    _purposeHint: purposeHint,
    _makeHint: makeHint && !/^(MAKE|MODEL|hhh+)/i.test(makeHint) ? makeHint : '',
    _modelHints: rego.modelHint ? [{ rego: rego.rego, model: rego.modelHint }] : [],
  }
}
