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
  await context.route('**/*.tile.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/svg+xml', body: TILE }))
}

async function runOnce(browser, iteration) {
  const counters = { routing: 0, elevation: 0 }
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    permissions: ['geolocation'], geolocation: geo(ORIGIN, 8),
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  })
  await installStubs(context, counters)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/tile|Failed to load resource/i.test(m.text())) errors.push(m.text()) })

  const t0 = Date.now()
  await page.goto('http://localhost:4180/Claude-orion/', { waitUntil: 'load' })
  await page.waitForSelector('.leaflet-container')
  const loadMs = Date.now() - t0

  await page.locator('.btn-secondary', { hasText: 'Use my current location' }).click()
  await page.waitForTimeout(600)
  const startLabel = await page.locator('.panel-section .hint').first().innerText()

  const t1 = Date.now()
  await page.locator('.sidebar-footer .btn').click()
  await page.waitForSelector('.route-card', { timeout: 40000 })
  await page.waitForTimeout(400)
  const searchMs = Date.now() - t1

  const cards = await page.locator('.route-select').allInnerTexts()
  const summary = cards.map((t) => t.split('\n').filter(Boolean).slice(0, 2).join(' | '))

  // Route geometry, straight from the GPX the app produces.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.locator('.route-card[aria-current="true"] button.btn', { hasText: /Send to phone|Download/ }).click(),
  ])
  let gpx = ''
  for await (const chunk of await download.createReadStream()) gpx += chunk
  const coords = [...gpx.matchAll(/lat="([-\d.]+)" lon="([-\d.]+)"/g)].map((m) => ({ lat: +m[1], lng: +m[2] }))

  await page.locator('.route-card[aria-current="true"] button.btn', { hasText: 'Start run' }).click()
  await page.waitForSelector('.nav', { timeout: 10000 })

  // Walk the first 60% of the loop at a realistic fix cadence.
  const samples = []
  const instructions = new Set()
  let offRouteWarnings = 0
  const stride = Math.max(1, Math.floor(coords.length / 60))
  const limit = Math.floor(coords.length * 0.6)
  const tRun = Date.now()
  for (let i = 0; i < limit; i += stride) {
    await context.setGeolocation(geo(coords[i]))
    await page.waitForTimeout(110)
    if (i % (stride * 8) === 0) {
      const sub = await page.locator('.nav-sub').innerText().catch(() => '')
      const done = sub.match(/([\d.]+) mi done/)
      if (done) samples.push(Number(done[1]))
      const banner = await page.locator('.nav-instruction').innerText().catch(() => '')
      if (banner) instructions.add(banner)
      if (await page.locator('.nav-alert').count()) offRouteWarnings++
    }
  }
  const runMs = Date.now() - tRun

  const monotonic = samples.every((v, i) => i === 0 || v >= samples[i - 1])
  const finalDone = samples[samples.length - 1] ?? null

  await page.locator('.nav-end').click()
  await page.waitForTimeout(500)
  const startAfter = await page.locator('.panel-section .hint').first().innerText()

  await context.close()
  return {
    iteration, loadMs, searchMs, runMs,
    routing: counters.routing, elevation: counters.elevation,
    startLabel, startAfter, startHeld: startLabel === startAfter,
    routes: summary, routeCount: summary.length,
    points: coords.length,
    samples, monotonic, finalDone, offRouteWarnings,
    instructions: [...instructions].sort(),
    errors,
  }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const results = []
for (let i = 1; i <= 6; i++) {
  const r = await runOnce(browser, i)
  results.push(r)
  console.log(`run ${i}: load ${r.loadMs}ms · search ${r.searchMs}ms · run ${r.runMs}ms · ` +
    `${r.routeCount} routes · ${r.points} pts · done ${r.finalDone} mi · ` +
    `mono ${r.monotonic} · offRoute ${r.offRouteWarnings} · errors ${r.errors.length}`)
}
await browser.close()

const uniq = (xs) => [...new Set(xs.map((x) => JSON.stringify(x)))]
console.log('\n=== CONSISTENCY ===')
console.log('distinct route sets:      ', uniq(results.map((r) => r.routes)).length, '(1 = identical every time)')
console.log('distinct route counts:    ', uniq(results.map((r) => r.routeCount)).length)
console.log('distinct point counts:    ', uniq(results.map((r) => r.points)).length)
console.log('distinct final progress:  ', uniq(results.map((r) => r.finalDone)).length, results.map((r) => r.finalDone).join(', '))
console.log('distinct instruction sets:', uniq(results.map((r) => r.instructions)).length)
console.log('start held every run:     ', results.every((r) => r.startHeld))
console.log('progress monotonic:       ', results.every((r) => r.monotonic))
console.log('spurious off-route:       ', results.reduce((n, r) => n + r.offRouteWarnings, 0))
console.log('routing calls per run:    ', results.map((r) => r.routing).join(', '))
console.log('elevation calls per run:  ', results.map((r) => r.elevation).join(', '))
const spread = (key) => {
  const xs = results.map((r) => r[key])
  return `${Math.min(...xs)}–${Math.max(...xs)}ms (spread ${Math.max(...xs) - Math.min(...xs)})`
}
console.log('load time:                ', spread('loadMs'))
console.log('search time:              ', spread('searchMs'))
console.log('total errors:             ', results.reduce((n, r) => n + r.errors.length, 0))
for (const r of results) if (r.errors.length) console.log(`  run ${r.iteration}:`, r.errors.slice(0, 2))
if (uniq(results.map((r) => r.routes)).length > 1) {
  console.log('\n!! route sets differed between runs:')
  results.forEach((r) => console.log(` run ${r.iteration}:`, r.routes.join('  //  ')))
}
