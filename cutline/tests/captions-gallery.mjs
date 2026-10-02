// Renders every caption preset with the real renderer in Chromium, over a
// talking-head-like scene (a white tee and a bright window behind the
// captions: the hard cases) and over a plain white wall, at several moments
// of a page. Writes full-size PNGs, contact sheets, motion strips and other
// aspect ratios, then checks the worker/OffscreenCanvas path and times a
// frame. Look at the pictures: that's the test.
//
// Usage: node tests/captions-gallery.mjs [outDir]   (default: <tmpdir>/cutline-captions-gallery)
//        ONLY=bold,neon node tests/captions-gallery.mjs   just those presets' frames and sheets
// Files: contact-sheet.png (every preset x start / mid-word / end / white wall / MONEY page),
// overview-*.png, sheet-<preset>.png, detail-<preset>.png (full size), motion-<preset>.png,
// aspect-16x9.png, aspect-1x1.png, and <preset>-<moment>-<background>.png at 1080x1920.
// Needs Playwright's Chromium (already installed; never `playwright install`).
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.argv[2] ?? join(tmpdir(), 'cutline-captions-gallery')
mkdirSync(out, { recursive: true })

const GALLERY_PATH = '/__captions-gallery'
const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'warn',
  clearScreen: false,
  server: { host: 'localhost', port: 5317, hmr: false },
  // Nothing to pre-bundle: the gallery only loads src/captions, which has no runtime deps.
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [
    {
      name: 'captions-gallery-page',
      configureServer(s) {
        s.middlewares.use(GALLERY_PATH, (_req, res) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end('<!doctype html><html><head><meta charset="utf-8"><title>Captions gallery</title></head><body></body></html>')
        })
      },
    },
  ],
})
await server.listen()
const origin = server.resolvedUrls.local[0].replace(/\/$/, '')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 600, height: 600 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

const save = (name, dataUrl) => {
  writeFileSync(join(out, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
  return name
}

/* ---- Everything below `installGallery` runs in the page. ---- */

async function installGallery() {
  const [render, presets, fonts] = await Promise.all([
    import('/src/captions/render.ts'),
    import('/src/captions/presets.ts'),
    import('/src/captions/fonts.ts'),
  ])
  await Promise.all(
    presets.PRESET_ORDER.map((id) => fonts.ensureFont(presets.PRESETS[id].style.font, presets.PRESETS[id].style.weight)),
  )

  // "So here's the thing NOBODY tells you about MONEY", as a transcript would time it.
  const WORDS = [
    ['So', 0.0, 0.18],
    ["here's", 0.18, 0.42],
    ['the', 0.42, 0.52],
    ['thing', 0.52, 0.86],
    ['NOBODY', 0.92, 1.38, true],
    ['tells', 1.38, 1.62],
    ['you', 1.62, 1.76],
    ['about', 1.76, 2.02],
    ['MONEY', 2.08, 2.62, true],
  ].map(([text, start, end, emphasis], i) => ({ id: `w${i}`, text, start, end, emphasis: !!emphasis }))

  function paginate(wordsPerPage) {
    const pages = []
    for (let i = 0; i < WORDS.length; i += wordsPerPage) {
      const words = WORDS.slice(i, i + wordsPerPage)
      pages.push({ index: pages.length, start: words[0].start, end: 0, words, emoji: null })
    }
    pages.forEach((p, i) => {
      p.end = i + 1 < pages.length ? pages[i + 1].start : p.words[p.words.length - 1].end + 0.6
    })
    return pages
  }

  /** The page with NOBODY on it (and 🤫), and the page with MONEY (and 💰). */
  function samplePages(style) {
    const pages = paginate(style.wordsPerPage)
    const nobody = pages.find((p) => p.words.some((w) => w.text === 'NOBODY'))
    const money = pages.find((p) => p.words.some((w) => w.text === 'MONEY'))
    return {
      nobody: { ...nobody, emoji: nobody === money ? '💰' : '🤫' },
      money: { ...money, emoji: '💰' },
    }
  }

  /** The moments worth looking at on a page. */
  function moments(p) {
    const nobody = p.words.find((w) => w.text === 'NOBODY') ?? p.words[0]
    return {
      start: p.start + 0.06,
      mid: (nobody.start + nobody.end) / 2,
      end: p.end - 0.02,
    }
  }

  // A small seeded PRNG so the scene is identical on every run.
  function rng(seed) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
  }

  /** A stand-in for a talking-head shot: warm wall, bright window, a person in a white tee. */
  function paintScene(ctx, w, h) {
    const s = Math.min(w, h)
    const wall = ctx.createLinearGradient(0, 0, w * 0.3, h)
    wall.addColorStop(0, '#7d6e62')
    wall.addColorStop(0.55, '#5a4d44')
    wall.addColorStop(1, '#2e2723')
    ctx.fillStyle = wall
    ctx.fillRect(0, 0, w, h)
    // Window light pouring in from the right, right where captions sit.
    const win = ctx.createRadialGradient(w * 0.86, h * 0.5, 0, w * 0.86, h * 0.5, Math.max(w, h) * 0.5)
    win.addColorStop(0, 'rgba(255,252,244,1)')
    win.addColorStop(0.35, 'rgba(255,248,232,0.95)')
    win.addColorStop(0.7, 'rgba(255,240,215,0.35)')
    win.addColorStop(1, 'rgba(255,240,215,0)')
    ctx.fillStyle = win
    ctx.fillRect(0, 0, w, h)
    // A shelf and a plant on the left so it isn't just gradients.
    ctx.fillStyle = '#3b2f28'
    ctx.fillRect(0, h * 0.3, w * 0.24, s * 0.025)
    ctx.fillStyle = '#2f5d3a'
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      ctx.ellipse(w * 0.1 + Math.sin(i * 1.7) * s * 0.05, h * 0.3 - s * (0.05 + (i % 3) * 0.03), s * 0.025, s * 0.07, (i - 3) * 0.35, 0, Math.PI * 2)
      ctx.fill()
    }
    // The person.
    const cx = w / 2
    const headY = h * 0.38
    ctx.fillStyle = '#e8e4de'
    ctx.beginPath()
    ctx.ellipse(cx, h * 1.02, s * 0.5, h * 0.42, 0, Math.PI, Math.PI * 2)
    ctx.fill()
    const shade = ctx.createLinearGradient(cx - s * 0.5, 0, cx + s * 0.5, 0)
    shade.addColorStop(0, 'rgba(0,0,0,0.22)')
    shade.addColorStop(0.6, 'rgba(0,0,0,0)')
    ctx.fillStyle = shade
    ctx.beginPath()
    ctx.ellipse(cx, h * 1.02, s * 0.5, h * 0.42, 0, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#b98166'
    ctx.fillRect(cx - s * 0.07, headY + s * 0.12, s * 0.14, h * 0.14)
    ctx.fillStyle = '#c8937a'
    ctx.beginPath()
    ctx.ellipse(cx, headY, s * 0.165, s * 0.215, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2b1e18'
    ctx.beginPath()
    ctx.ellipse(cx, headY - s * 0.11, s * 0.175, s * 0.13, 0, Math.PI, Math.PI * 2)
    ctx.fill()
    // Grain, lightly, so it reads as footage.
    const rand = rng(7)
    const img = ctx.getImageData(0, 0, w, h)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * 10
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n
    }
    ctx.putImageData(img, 0, 0)
  }

  const scenes = new Map()
  function background(kind, w, h) {
    const key = `${kind}:${w}x${h}`
    if (!scenes.has(key)) {
      const c = new OffscreenCanvas(w, h)
      const ctx = c.getContext('2d')
      if (kind === 'white') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
      } else paintScene(ctx, w, h)
      scenes.set(key, c)
    }
    return scenes.get(key)
  }

  function frame(id, kind, which, w, h, at) {
    const style = presets.presetStyle(id)
    const pages = samplePages(style)
    const p = which === 'money' ? pages.money : pages.nobody
    const t = at ?? (which === 'money' ? (p.words.at(-1).start + p.words.at(-1).end) / 2 : moments(p)[which])
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(background(kind, w, h), 0, 0)
    render.drawCaptions(ctx, p, t, style, { width: w, height: h })
    return { canvas, t }
  }

  function label(ctx, text, x, y, size = 22) {
    ctx.font = `600 ${size}px Inter, sans-serif`
    ctx.fillStyle = '#e8e8ee'
    ctx.textBaseline = 'top'
    ctx.fillText(text, x, y)
  }

  /** Lays canvases out in a grid with a caption under each. */
  function sheet(cells, cols, cellW, cellH, title) {
    const pad = 12
    const labelH = 30
    const rows = Math.ceil(cells.length / cols)
    const top = title ? 44 : 0
    const c = document.createElement('canvas')
    c.width = cols * (cellW + pad) + pad
    c.height = top + rows * (cellH + labelH + pad) + pad
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#16161c'
    ctx.fillRect(0, 0, c.width, c.height)
    if (title) label(ctx, title, pad, 10, 26)
    cells.forEach(({ canvas, text, crop }, i) => {
      const x = pad + (i % cols) * (cellW + pad)
      const y = top + pad + Math.floor(i / cols) * (cellH + labelH + pad)
      ctx.imageSmoothingQuality = 'high'
      if (crop) ctx.drawImage(canvas, crop[0], crop[1], crop[2], crop[3], x, y, cellW, cellH)
      else ctx.drawImage(canvas, x, y, cellW, cellH)
      label(ctx, text, x, y + cellH + 4, 18)
    })
    return c.toDataURL('image/png')
  }

  window.gallery = {
    ids: presets.PRESET_ORDER,
    names: Object.fromEntries(presets.PRESET_ORDER.map((id) => [id, presets.PRESETS[id].name])),
    full(id, kind, which, w = 1080, h = 1920) {
      const { canvas, t } = frame(id, kind, which, w, h)
      return { url: canvas.toDataURL('image/png'), t }
    },
    presetSheet(id) {
      const cells = [
        ['photo', 'start'],
        ['photo', 'mid'],
        ['photo', 'end'],
        ['white', 'mid'],
        ['photo', 'money'],
      ].map(([kind, which]) => {
        const { canvas, t } = frame(id, kind, which, 1080, 1920)
        return { canvas, text: `${which} t=${t.toFixed(2)} ${kind}` }
      })
      return sheet(cells, 5, 360, 640, `${presets.PRESETS[id].name} (${id})`)
    },
    /** Full-resolution crop of the caption area, photo and white side by side. */
    detail(id, which = 'mid') {
      const style = presets.presetStyle(id)
      const y0 = Math.max(0, Math.round((style.position - 0.2) * 1920))
      const crop = [0, y0, 1080, 760]
      const cells = ['photo', 'white'].map((kind) => {
        const { canvas, t } = frame(id, kind, which, 1080, 1920)
        return { canvas, crop, text: `${kind} t=${t.toFixed(2)}` }
      })
      return sheet(cells, 2, 1080, 760, `${presets.PRESETS[id].name}: ${which}, full size`)
    },
    /** A strip of moments through a page, cropped to the captions, to check the motion. */
    motion(id, times) {
      const style = presets.presetStyle(id)
      const p = samplePages(style).nobody
      const ts = times ?? [0, 0.03, 0.06, 0.1, 0.16, 0.3].map((d) => p.start + d)
        .concat(p.words.slice(1, 3).flatMap((w) => [w.start, w.start + 0.04, w.start + 0.08, w.start + 0.16]))
      const y0 = Math.max(0, Math.round((style.position - 0.17) * 1920))
      const crop = [0, y0, 1080, 640]
      const cells = ts.map((t) => {
        const { canvas } = frame(id, 'photo', 'start', 1080, 1920, t)
        return { canvas, crop, text: `t=${t.toFixed(3)}` }
      })
      return sheet(cells, 4, 405, 240, `${presets.PRESETS[id].name}: motion`)
    },
    contact() {
      const cells = []
      for (const id of presets.PRESET_ORDER) {
        for (const [kind, which] of [
          ['photo', 'start'],
          ['photo', 'mid'],
          ['photo', 'end'],
          ['white', 'mid'],
          ['photo', 'money'],
        ]) {
          const { canvas } = frame(id, kind, which, 1080, 1920)
          cells.push({ canvas, text: `${presets.PRESETS[id].name} · ${which}${kind === 'white' ? ' (white)' : ''}` })
        }
      }
      return sheet(cells, 5, 216, 384, 'Cutline caption presets: start, mid-word, end, white wall, MONEY page')
    },
    overview(kind) {
      const cells = presets.PRESET_ORDER.map((id) => ({ canvas: frame(id, kind, 'mid', 1080, 1920).canvas, text: presets.PRESETS[id].name }))
      return sheet(cells, 5, 324, 576, `All presets mid-word, ${kind === 'white' ? 'white wall' : 'scene'}`)
    },
    aspect(w, h, cols, cellW) {
      const cellH = Math.round((cellW * h) / w)
      const cells = presets.PRESET_ORDER.map((id) => ({ canvas: frame(id, 'photo', 'mid', w, h).canvas, text: presets.PRESETS[id].name }))
      return sheet(cells, cols, cellW, cellH, `${w}x${h}`)
    },
    /** Average ms per drawCaptions call at 1080x1920 over a run of frames, per preset. */
    bench() {
      const c = document.createElement('canvas')
      c.width = 1080
      c.height = 1920
      const ctx = c.getContext('2d')
      const result = {}
      for (const id of presets.PRESET_ORDER) {
        const style = presets.presetStyle(id)
        const pages = paginate(style.wordsPerPage)
        const end = pages.at(-1).end
        let n = 0
        const t0 = performance.now()
        for (let t = 0; t < end; t += 1 / 60) {
          const p = pages.find((pg) => t >= pg.start && t < pg.end) ?? null
          render.drawCaptions(ctx, p, t, style, { width: 1080, height: 1920 })
          n++
        }
        ctx.getImageData(0, 0, 1, 1) // flush
        result[id] = +((performance.now() - t0) / n).toFixed(3)
      }
      return result
    },
    /** Draws the same frame on the main thread, on an OffscreenCanvas, and in a worker; returns the worst pixel difference. */
    async offscreen(id) {
      const w = 540
      const h = 960
      const style = presets.presetStyle(id)
      const p = samplePages(style).nobody
      const t = moments(p).mid
      const main = document.createElement('canvas')
      main.width = w
      main.height = h
      render.drawCaptions(main.getContext('2d'), p, t, style, { width: w, height: h })
      const off = new OffscreenCanvas(w, h)
      render.drawCaptions(off.getContext('2d'), p, t, style, { width: w, height: h })
      const src = `
        import { drawCaptions } from '${location.origin}/src/captions/render.ts'
        import { ensureFont } from '${location.origin}/src/captions/fonts.ts'
        self.onmessage = async ({ data }) => {
          await ensureFont(data.style.font, data.style.weight)
          const c = new OffscreenCanvas(data.w, data.h)
          drawCaptions(c.getContext('2d'), data.page, data.t, data.style, { width: data.w, height: data.h })
          const bitmap = c.transferToImageBitmap()
          self.postMessage({ bitmap, hasFonts: 'fonts' in self }, [bitmap])
        }`
      const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' })
      const fromWorker = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data)
        worker.onerror = (e) => reject(new Error(e.message || 'worker failed'))
        worker.postMessage({ page: p, t, style, w, h })
      })
      worker.terminate()
      const pixels = (source) => {
        const c = new OffscreenCanvas(w, h)
        const ctx = c.getContext('2d')
        ctx.drawImage(source, 0, 0)
        return ctx.getImageData(0, 0, w, h).data
      }
      const a = pixels(main)
      const diff = (b) => {
        let worst = 0
        let changed = 0
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i] - b[i])
          if (d > worst) worst = d
          if (d > 16) changed++
        }
        return { worst, changed }
      }
      let inked = 0
      for (let i = 3; i < a.length; i += 4) if (a[i] > 0) inked++
      return { inked, offscreen: diff(pixels(off)), worker: diff(pixels(fromWorker.bitmap)), workerHasFonts: fromWorker.hasFonts }
    },
  }
  return {
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`),
  }
}

try {
  await page.goto(`${origin}${GALLERY_PATH}`)
  const info = await page.evaluate(installGallery)
  console.log('fonts loaded:', [...new Set(info.loaded)].join(', '))
  const ids = await page.evaluate(() => window.gallery.ids)
  const only = process.env.ONLY ? process.env.ONLY.split(',') : ids

  for (const id of only) {
    for (const [kind, which] of [
      ['photo', 'start'],
      ['photo', 'mid'],
      ['photo', 'end'],
      ['white', 'mid'],
      ['photo', 'money'],
    ]) {
      const { url } = await page.evaluate(([a, b, c]) => window.gallery.full(a, b, c), [id, kind, which])
      save(`${id}-${which}-${kind}.png`, url)
    }
    save(`sheet-${id}.png`, await page.evaluate((a) => window.gallery.presetSheet(a), id))
    save(`detail-${id}.png`, await page.evaluate((a) => window.gallery.detail(a), id))
    save(`motion-${id}.png`, await page.evaluate((a) => window.gallery.motion(a), id))
  }
  if (!process.env.ONLY) {
    save('contact-sheet.png', await page.evaluate(() => window.gallery.contact()))
    save('overview-photo.png', await page.evaluate(() => window.gallery.overview('photo')))
    save('overview-white.png', await page.evaluate(() => window.gallery.overview('white')))
    save('aspect-16x9.png', await page.evaluate(() => window.gallery.aspect(1920, 1080, 2, 640)))
    save('aspect-1x1.png', await page.evaluate(() => window.gallery.aspect(1080, 1080, 5, 300)))
    console.log('ms per frame at 1080x1920:', await page.evaluate(() => window.gallery.bench()))
    for (const id of ['bold', 'neon', 'karaoke']) {
      console.log(`offscreen/worker check (${id}):`, await page.evaluate((a) => window.gallery.offscreen(a), id))
    }
  }
  console.log(`wrote ${out}`)
  if (errors.length) {
    console.error('page errors:\n' + errors.join('\n'))
    process.exitCode = 1
  }
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  await browser.close()
  await server.close()
}
