import { chromium } from 'playwright'
const M_LAT = 111320, ORIGIN = { lat: 42.36, lng: -71.06 }
const mLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)
const toXY = (p) => ({ x: (p.lng - ORIGIN.lng) * mLng(ORIGIN.lat), y: (p.lat - ORIGIN.lat) * M_LAT })
const toLL = ({ x, y }) => ({ lat: ORIGIN.lat + y / M_LAT, lng: ORIGIN.lng + x / mLng(ORIGIN.lat) })
const rad = (d) => (d * Math.PI) / 180
const hav = (a, b) => { const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2; return 2*6371008.8*Math.asin(Math.min(1,Math.sqrt(h))) }
const snap = (v) => Math.round(v / 120) * 120

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const context = await browser.newContext({
  viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  permissions: ['geolocation'], geolocation: { latitude: 42.36, longitude: -71.06, accuracy: 8 },
})
// A grid city with frequent kerb jogs — the shape that inflated the old count.
await context.route('**/routed-foot/route/v1/foot/**', async (route) => {
  const p = new URL(route.request().url()).pathname
  const wps = decodeURIComponent(p.split('/foot/')[1]).split(';').map((s) => { const [lng, lat] = s.split(',').map(Number); return { lat, lng } })
  const sn = wps.map((w) => { const { x, y } = toXY(w); return { x: snap(x), y: snap(y) } })
  const pts = [sn[0]]
  for (let i = 1; i < sn.length; i++) for (const ax of ['x','y']) {
    const cur = { ...pts[pts.length-1] }, d = sn[i][ax]-cur[ax], steps = Math.max(1, Math.ceil(Math.abs(d)/25))
    for (let s2 = 1; s2 <= steps; s2++) pts.push({ ...cur, [ax]: cur[ax] + (d*s2)/steps })
  }
  const path = pts.map(toLL)
  let distance = 0; for (let i = 1; i < path.length; i++) distance += hav(path[i-1], path[i])
  let axis = null, n = 0
  const steps = [{ name: 'Home St', maneuver: { type: 'depart', location: [path[0].lng, path[0].lat] } }]
  for (let i = 1; i < path.length; i++) {
    const moved = Math.abs(path[i].lng - path[i-1].lng) > 1e-9 ? 'x' : Math.abs(path[i].lat - path[i-1].lat) > 1e-9 ? 'y' : null
    if (!moved) continue
    if (axis && moved !== axis) {
      const name = ['Mill Road','Oak Avenue','Church Lane','Park Street'][n % 4]
      steps.push({ name, maneuver: { type: 'turn', modifier: n % 2 ? 'right' : 'left', location: [path[i].lng, path[i].lat] } })
      // A kerb jog: a second maneuver a few metres later, as real crossings give.
      const j = Math.min(i + 1, path.length - 1)
      steps.push({ name, maneuver: { type: 'turn', modifier: n % 2 ? 'left' : 'right', location: [path[j].lng, path[j].lat] } })
      n++
    }
    axis = moved
  }
  const end = path[path.length-1]
  steps.push({ maneuver: { type: 'arrive', location: [end.lng, end.lat] } })
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok',
    routes: [{ distance, geometry: { coordinates: path.map((q) => [q.lng, q.lat]) }, legs: [{ steps }] }] }) })
})
await context.route('**/v1/elevation**', async (route) => {
  const u = new URL(route.request().url())
  const lats = u.searchParams.get('latitude').split(',').map(Number)
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elevation: lats.map(() => 10) }) })
})
await context.route('**/tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml',
  body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#2b3038"/></svg>', 'utf8') }))

const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4180/Claude-orion/', { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.locator('.btn-secondary', { hasText: 'Use my current location' }).click()
await page.waitForTimeout(700)
await page.locator('.sidebar-footer .btn').click()
await page.waitForSelector('.route-card', { timeout: 40000 })
await page.waitForTimeout(700)

console.log('--- headline stats no longer mention turns:',
  !(await page.locator('.route-stats').first().innerText()).toLowerCase().includes('turn'))
const notes = await page.locator('.route-note').allInnerTexts()
notes.forEach((t, i) => console.log(`--- card ${i + 1} note: ${t}`))
console.log('--- simplest option named once:', await page.locator('.route-simplest').count())
console.log('--- reassurance on the chosen card:',
  (await page.locator('.route-reassure').first().innerText().catch(() => '(none)')))
console.log('--- reassurance appears only on the selected card:', await page.locator('.route-reassure').count())
await page.locator('.route-card').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
await page.screenshot({ path: process.argv[2] })
console.log('--- js errors:', errors.length ? errors : 'none')
await browser.close()
