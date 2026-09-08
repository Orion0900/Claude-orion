import { chromium } from 'playwright'

// --- stand-in city: Manhattan grid, terrain climbing east ---
const M_LAT = 111320, ORIGIN = { lat: 42.36, lng: -71.06 }
const mLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)
const toXY = (p) => ({ x: (p.lng - ORIGIN.lng) * mLng(ORIGIN.lat), y: (p.lat - ORIGIN.lat) * M_LAT })
const toLL = ({ x, y }) => ({ lat: ORIGIN.lat + y / M_LAT, lng: ORIGIN.lng + x / mLng(ORIGIN.lat) })
const rad = (d) => (d * Math.PI) / 180
const hav = (a, b) => {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}
const snap = (v) => Math.round(v / 120) * 120
const geo = (p, accuracy = 6) => ({ latitude: p.lat, longitude: p.lng, accuracy })

const TILE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
  '<rect width="256" height="256" fill="#3a3f46"/></svg>', 'utf8')

async function installStubs(context, counters) {
  await context.route('**/routed-foot/route/v1/foot/**', async (route) => {
    counters.routing++
    const p = new URL(route.request().url()).pathname
    const wps = decodeURIComponent(p.split('/foot/')[1]).split(';')
      .map((s) => { const [lng, lat] = s.split(',').map(Number); return { lat, lng } })
    const sn = wps.map((w) => { const { x, y } = toXY(w); return { x: snap(x), y: snap(y) } })
    const pts = [sn[0]]
    for (let i = 1; i < sn.length; i++) for (const ax of ['x', 'y']) {
      const cur = { ...pts[pts.length - 1] }
      const d = sn[i][ax] - cur[ax]
      const steps = Math.max(1, Math.ceil(Math.abs(d) / 25))
      for (let s = 1; s <= steps; s++) pts.push({ ...cur, [ax]: cur[ax] + (d * s) / steps })
    }
    const path = pts.map(toLL)
    let distance = 0
    for (let i = 1; i < path.length; i++) distance += hav(path[i - 1], path[i])
    let axis = null, n = 0
    const steps = [{ name: 'Home Street', maneuver: { type: 'depart', location: [path[0].lng, path[0].lat] } }]
    for (let i = 1; i < path.length; i++) {
      const moved = Math.abs(path[i].lng - path[i - 1].lng) > 1e-9 ? 'x'
        : Math.abs(path[i].lat - path[i - 1].lat) > 1e-9 ? 'y' : null
      if (!moved) continue
      if (axis && moved !== axis) {
        steps.push({
          name: ['Mill Road', 'Oak Avenue', 'Church Lane', 'Park Street'][n % 4],
          maneuver: { type: 'turn', modifier: n % 2 ? 'right' : 'left', location: [path[i].lng, path[i].lat] },
        })
        n++
      }
      axis = moved
    }
    const end = path[path.length - 1]
    steps.push({ maneuver: { type: 'arrive', location: [end.lng, end.lat] } })
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      code: 'Ok',
      routes: [{ distance, geometry: { coordinates: path.map((q) => [q.lng, q.lat]) }, legs: [{ steps }] }],
    })})
  })
  await context.route('**/v1/elevation**', async (route) => {
    counters.elevation++
    const u = new URL(route.request().url())
    const lats = u.searchParams.get('latitude').split(',').map(Number)
    const lngs = u.searchParams.get('longitude').split(',').map(Number)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      elevation: lats.map((lat, i) => (30 * Math.max(0, toXY({ lat, lng: lngs[i] }).x)) / 1000),
    })})
  })
  await context.route('**/tile.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: TILE }))
}


// Deterministic jitter, so a noisy run is still repeatable.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const jitter = (p, rng, metres) => {
  const bearing = rng() * 2 * Math.PI
  const d = rng() * metres
  return toLL({ x: toXY(p).x + Math.cos(bearing) * d, y: toXY(p).y + Math.sin(bearing) * d })
}

async function session(browser, { cycles, noiseMetres, label }) {
  const counters = { routing: 0, elevation: 0 }
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    permissions: ['geolocation'], geolocation: geo(ORIGIN, 8), acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  })
  await installStubs(context, counters)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('http://localhost:4180/Claude-orion/', { waitUntil: 'load' })
  await page.waitForSelector('.leaflet-container')
  await page.locator('.btn-secondary', { hasText: 'Use my current location' }).click()
  await page.waitForTimeout(600)
  await page.locator('.sidebar-footer .btn').click()
  await page.waitForSelector('.route-card', { timeout: 40000 })
  await page.waitForTimeout(400)

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('.route-card[aria-current="true"] button.btn', { hasText: /Send to phone|Download/ }).click(),
  ])
  let gpx = ''
  for await (const chunk of await download.createReadStream()) gpx += chunk
  const coords = [...gpx.matchAll(/lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => ({ lat: +m[1], lng: +m[2] }))

  const cycleResults = []
  for (let c = 1; c <= cycles; c++) {
    const rng = mulberry32(1234 + c)
    // A runner starting a second loop is standing at the start, not teleporting
    // back from wherever the last one ended.
    await context.setGeolocation(geo(coords[0], 6))
    await page.waitForTimeout(400)
    await page.locator('.route-card[aria-current="true"] button.btn', { hasText: 'Start run' }).click()
    await page.waitForSelector('.nav', { timeout: 10000 })
    // Decisive: what does it say before any fix of this run has been fed?
    const atMount = await page.locator('.nav-sub').innerText().catch(() => '(none)')
    console.log(`     at mount, before any fix: ${atMount}`)

    const samples = []
    let offRoute = 0, flipped = 0
    const stride = Math.max(1, Math.floor(coords.length / 45))
    const limit = Math.floor(coords.length * 0.5)
    const t = Date.now()
    for (let i = 0; i < limit; i += stride) {
      const p = noiseMetres ? jitter(coords[i], rng, noiseMetres) : coords[i]
      await context.setGeolocation(geo(p, noiseMetres ? 12 : 6))
      await page.waitForTimeout(105)
      if (i % (stride * 6) === 0) {
        const sub = await page.locator('.nav-sub').innerText().catch(() => '')
        const m = sub.match(/([\d.]+) mi done/)
        if (m) samples.push(Number(m[1]))
        if (await page.locator('.nav-alert').count()) offRoute++
        if (await page.locator('.nav-note').count()) flipped++
      }
    }
    const elapsed = Date.now() - t
    await page.locator('.nav-end').click()
    await page.waitForTimeout(400)

    const monotonic = samples.every((v, i) => i === 0 || v >= samples[i - 1])
    cycleResults.push({ c, samples, monotonic, final: samples[samples.length - 1] ?? null, offRoute, flipped, elapsed })
    const dips = samples.map((v, i) => (i > 0 && v < samples[i - 1] ? `${i}:${samples[i-1]}->${v}` : null)).filter(Boolean)
    console.log(`  ${label} cycle ${c}: done ${samples[samples.length - 1]} mi · mono ${monotonic} · ` +
      `offRoute ${offRoute} · ${elapsed}ms`)
    console.log(`     samples: ${samples.join(' ')}`)
    if (dips.length) console.log(`     dips at: ${dips.join(', ')}`)
  }

  await context.close()
  return { cycleResults, errors, counters }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

console.log('=== A. Five runs back to back in ONE session, clean GPS ===')
const a = await session(browser, { cycles: 5, noiseMetres: 0, label: 'clean' })

console.log('\n=== B. Five runs with realistic GPS noise (+/-12 m) ===')
const b = await session(browser, { cycles: 5, noiseMetres: 12, label: 'noisy' })

console.log('\n=== C. Repeated searches in one session ===')
{
{
  const counters = { routing: 0, elevation: 0 }
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true,
    permissions: ['geolocation'], geolocation: geo(ORIGIN, 8),
  })
  await installStubs(context, counters)
  const page = await context.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto('http://localhost:4180/Claude-orion/', { waitUntil: 'load' })
  await page.waitForSelector('.leaflet-container')
  await page.locator('.btn-secondary', { hasText: 'Use my current location' }).click()
  await page.waitForTimeout(600)
  const times = []
  for (let i = 1; i <= 6; i++) {
    const t = Date.now()
    await page.locator('.sidebar-footer .btn').click()
    await page.waitForSelector('.route-card', { timeout: 40000 })
    await page.waitForTimeout(300)
    times.push(Date.now() - t)
  }
  const heap = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)
  console.log('  search times:', times.join(', '), 'ms')
  console.log('  drift first->last:', times[times.length - 1] - times[0], 'ms')
  console.log('  heap after 6 searches:', heap, 'MB')
  console.log('  errors:', errs.length)
  await context.close()
}

}
await browser.close()

const summarise = (name, r) => {
  const finals = r.cycleResults.map((x) => x.final)
  console.log(`\n${name}`)
  console.log('  identical final progress:', new Set(finals).size === 1, `(${finals.join(', ')})`)
  console.log('  all monotonic:           ', r.cycleResults.every((x) => x.monotonic))
  console.log('  spurious off-route:      ', r.cycleResults.reduce((n, x) => n + x.offRoute, 0))
  console.log('  false direction flips:   ', r.cycleResults.reduce((n, x) => n + x.flipped, 0))
  console.log('  errors:                  ', r.errors.length, r.errors.slice(0, 2))
}
console.log('\n=== SUMMARY ===')
summarise('A. clean, repeated in one session', a)
summarise('B. noisy GPS', b)
