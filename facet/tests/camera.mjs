// The live camera: Chromium's fake webcam plays the demo face, and the guide
// should line it up, take the photo by itself once it holds still, and
// analyse it. Usage: npm run build && node tests/camera.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { assert, BASE, cache, root, serve, shot, watchErrors } from './support.mjs'

/** One 4:2:0 frame of the demo face, padded so it sits mid-frame at a natural size. */
async function demoVideo() {
  const file = join(cache, 'demo-face.y4m')
  if (existsSync(file)) return file
  const W = 1280
  const H = 1600
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const jpeg = readFileSync(join(root, 'public/demo/front.jpg')).toString('base64')
  const rgba = await page.evaluate(
    async ({ jpeg, W, H }) => {
      const img = new Image()
      img.src = `data:image/jpeg;base64,${jpeg}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const g = c.getContext('2d')
      g.fillStyle = 'rgb(200,198,193)'
      g.fillRect(0, 0, W, H)
      const s = 0.95
      g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2 + 60, img.width * s, img.height * s)
      return Array.from(g.getImageData(0, 0, W, H).data)
    },
    { jpeg, W, H },
  )
  await browser.close()
  const y = Buffer.alloc(W * H)
  const u = Buffer.alloc((W / 2) * (H / 2))
  const v = Buffer.alloc((W / 2) * (H / 2))
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 4
      y[j * W + i] = Math.round(0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2])
    }
  }
  for (let j = 0; j < H / 2; j++) {
    for (let i = 0; i < W / 2; i++) {
      const k = (2 * j * W + 2 * i) * 4
      const [r, g, b] = [rgba[k], rgba[k + 1], rgba[k + 2]]
      u[j * (W / 2) + i] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b)
      v[j * (W / 2) + i] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b)
    }
  }
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`), y, u, v]))
  return file
}

const video = await demoVideo()
const server = await serve(4411)
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
})
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await context.grantPermissions(['camera'])
const page = await context.newPage()
const errors = watchErrors(page)
try {
  await page.goto(`${server.origin}${BASE}`)
  await page.evaluate(() => localStorage.setItem('facet.settings', JSON.stringify({ sex: 'male', onboarded: true, showClinical: true, showMm: true })))
  await page.goto(`${server.origin}${BASE}#/new`)
  await page.reload()
  await page.getByRole('button', { name: 'Take a photo' }).click()
  await page.locator('.camera video').waitFor()
  await page.waitForTimeout(1500)
  await shot(page, 'camera-guide')
  // It should coach towards a good photo and take it unprompted.
  await page.getByText('Check the points', { exact: true }).waitFor({ timeout: 45_000 })
  assert(true, 'the camera guide takes the photo by itself once the face holds still')
  const banner = await page.locator('.banner').count()
  assert(banner === 0, 'the auto-captured photo passes every quality check')
  assert(errors.length === 0, `no page errors${errors.length ? `:\n${errors.join('\n')}` : ''}`)
} catch (e) {
  await shot(page, 'camera-failure')
  console.error(e.message)
  console.error('last status:', await page.locator('.camera-status').innerText().catch(() => '—'))
  if (errors.length) console.error(errors.join('\n'))
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
