// Secure server-side proxy to the CityTag web backend (undocumented API).
//
// Why: CityTag has no official API, but its web backstage (citytag.yuminstall.top)
// is a normal web app. This function logs in with the fleet's CityTag account
// (stored ONLY as Vercel env secrets — never shipped to the browser), reads the
// tags' last-known GPS, and returns just { rego, lat, lng, time, battery, address }.
// Secrets in the raw CityTag data (privatekey, mac, tokens) are never returned.
//
// Config (Vercel → Project → Settings → Environment Variables):
//   CITYTAG_USER  — the CityTag account username (the phone number you log in with)
//   CITYTAG_PASS  — that account's password
//
// Endpoints (reverse-engineered from the backstage's own JS):
//   POST /api/sign/in                         {username,password} -> { code:"00000", data:"<token>" } + Set-Cookie JSESSIONID
//   POST /api/citytag/b-device/item/selectPage {page,limit}       -> array; each { name:"REGO MODEL", sn, lastLatLng:"lat,lng", timestamp, voltageval, lastAddress }

const BASE = 'https://citytag.yuminstall.top'
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000 // reuse a login for up to 6h (token is valid ~24h)

let session: { token: string; cookie: string; at: number } | null = null

const normRego = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const firstWord = (s: string) => (s || '').trim().split(/\s+/)[0] || ''

async function login(): Promise<{ token: string; cookie: string }> {
  const username = process.env.CITYTAG_USER
  const password = process.env.CITYTAG_PASS
  if (!username || !password) {
    throw new Error('CityTag not configured — set CITYTAG_USER and CITYTAG_PASS in the server settings.')
  }
  const res = await fetch(`${BASE}/api/sign/in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }).toString(),
  })
  const setCookie = res.headers.get('set-cookie') || ''
  const cookie = (/JSESSIONID=[^;]+/.exec(setCookie) || [''])[0]
  const json: any = await res.json().catch(() => ({}))
  const token = typeof json.data === 'string' ? json.data : json?.data?.token
  if (json.code !== '00000' || !token) {
    throw new Error('CityTag login failed: ' + (json.msg || json.code || 'unknown'))
  }
  return { token, cookie }
}

async function getSession(force = false) {
  if (!force && session && Date.now() - session.at < TOKEN_TTL_MS) return session
  const s = await login()
  session = { ...s, at: Date.now() }
  return session
}

async function selectPage(s: { token: string; cookie: string }) {
  const res = await fetch(`${BASE}/api/citytag/b-device/item/selectPage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      token: s.token,
      Cookie: s.cookie,
    },
    body: new URLSearchParams({ page: '1', limit: '2000' }).toString(),
  })
  return res.json().catch(() => ({}))
}

// The whole tag list (all ~300) comes back in one call, so cache it briefly —
// opening several cars in a row then reuses it instantly instead of refetching.
// CityTag itself only updates every few minutes, so a short cache loses nothing.
let devicesCache: { at: number; devices: any[] } | null = null
const DEVICES_TTL_MS = 20 * 1000

async function fetchDevices(): Promise<any[]> {
  if (devicesCache && Date.now() - devicesCache.at < DEVICES_TTL_MS) return devicesCache.devices
  let s = await getSession()
  let json: any = await selectPage(s)
  const dead = json && !Array.isArray(json) && !Array.isArray(json.data)
  if (dead) {
    // session likely expired / not-logged-in — re-login once and retry
    s = await getSession(true)
    json = await selectPage(s)
  }
  const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []
  devicesCache = { at: Date.now(), devices: arr }
  return arr
}

function shape(d: any) {
  const parts = String(d?.lastLatLng || '').split(',')
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])
  return {
    rego: normRego(firstWord(d?.name)),
    name: d?.name || '',
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    time: d?.timestamp || d?.voltagetime || d?.gettime || null,
    battery: typeof d?.voltageval === 'number' ? d.voltageval : null,
    address: d?.lastAddress || '',
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const wanted = normRego(String((req?.query?.rego ?? '') || ''))
    const all = (await fetchDevices()).map(shape).filter((d) => d.lat !== null && d.lng !== null)
    if (wanted) {
      const device =
        all.find((d) => d.rego === wanted) ||
        all.find((d) => normRego(d.name).startsWith(wanted)) ||
        null
      return res.status(200).json({ ok: true, device })
    }
    return res.status(200).json({ ok: true, count: all.length, devices: all })
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: e?.message || 'tracking error' })
  }
}
