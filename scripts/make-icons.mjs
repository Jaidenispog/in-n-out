// Generates the PWA / apple-touch icons as PNGs with zero dependencies.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(publicDir, { recursive: true })

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixelFn) {
  // Raw RGBA scanlines, filter byte 0 per row.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size)
      const o = rowStart + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Icon artwork: iOS-blue rounded square, white car silhouette, in/out arrows ---
const BLUE = [10, 132, 255]
const DARK = [0, 90, 200]
const WHITE = [255, 255, 255]

const inRoundedSquare = (x, y, s, radiusFrac) => {
  const r = s * radiusFrac
  const cx = Math.min(Math.max(x, r), s - r)
  const cy = Math.min(Math.max(y, r), s - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function pixel(x, y, s) {
  if (!inRoundedSquare(x, y, s, 0.22)) return [0, 0, 0, 0]
  // vertical gradient blue -> darker blue
  const t = y / s
  let col = BLUE.map((c, i) => Math.round(c + (DARK[i] - c) * t))

  const u = x / s
  const v = y / s

  // Car body: rounded slab
  const bodyTop = 0.52
  const bodyBot = 0.68
  const bodyL = 0.16
  const bodyR = 0.84
  const inBody = u >= bodyL && u <= bodyR && v >= bodyTop && v <= bodyBot
  // Cabin: trapezoid above the body
  const cabTop = 0.4
  const inCabin =
    v >= cabTop && v < bodyTop && u >= 0.3 + (bodyTop - v) * 0.55 && u <= 0.7 + (bodyTop - v) * -0.0 + (bodyTop - v) * 0.15
  // Wheels
  const wheel = (wx) => (u - wx) ** 2 + (v - 0.68) ** 2 <= 0.055 ** 2
  const wheelHole = (wx) => (u - wx) ** 2 + (v - 0.68) ** 2 <= 0.025 ** 2
  if (inBody || inCabin || wheel(0.3) || wheel(0.7)) col = WHITE
  if (wheelHole(0.3) || wheelHole(0.7)) col = BLUE.map((c, i) => Math.round(c + (DARK[i] - c) * t))

  // "In" arrow (down-left, top-left area) and "out" arrow (up-right, top-right area)
  const arrow = (cx, cy, dir) => {
    // shaft
    const du = (u - cx) * dir
    const dv = v - cy
    const onShaft = Math.abs(du - dv * -1 * 0) < 0 // unused
    void onShaft
    return false
  }
  void arrow
  // Simple chevrons instead: down chevron top-left, up chevron top-right
  const chev = (cx, cy, flip) => {
    const du = Math.abs(u - cx)
    const dv = (v - cy) * flip
    return du <= 0.09 && dv >= du * 0.9 - 0.001 && dv <= du * 0.9 + 0.05
  }
  if (chev(0.28, 0.2, 1)) col = WHITE // pointing down = car coming IN
  if (chev(0.72, 0.26, -1)) col = WHITE // pointing up = car going OUT

  return [...col, 255]
}

for (const [name, size] of [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon.png', 64],
]) {
  writeFileSync(join(publicDir, name), encodePng(size, pixel))
  console.log('wrote public/' + name)
}
