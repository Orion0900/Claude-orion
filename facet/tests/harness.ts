// Runs the whole analysis on an image URL without the UI, for the browser
// checks in this folder. Served by the Vite dev server at /tests/harness.html.
import { loadPhoto, pixelsOf } from '../src/detect/image'
import { detectImage, getLandmarker } from '../src/detect/landmarker'
import { analyzeFront } from '../src/face/analyze'
import { computeFrame } from '../src/face/frame'
import { measurePixels } from '../src/face/pixels'
import type { Sex } from '../src/face/types'

declare global {
  interface Window {
    ready: Promise<unknown>
    analyzeUrl: (url: string, sex: Sex) => Promise<unknown>
  }
}

window.ready = getLandmarker()
window.analyzeUrl = async (url, sex) => {
  const blob = await (await fetch(url)).blob()
  const photo = await loadPhoto(blob)
  const detection = await detectImage(photo.canvas)
  if (!detection) return null
  const pixels = measurePixels(pixelsOf(photo.canvas), detection.landmarks, computeFrame(detection.landmarks))
  const a = analyzeFront({ detection, pixels, adjustments: {}, focal35: photo.exif?.focal35 }, { sex })
  return {
    size: [photo.width, photo.height],
    pixels,
    pose: a.pose,
    harmony: a.harmony,
    groups: a.groups,
    mmPerPx: a.mmPerPx,
    hairline: a.hairline,
    shape: { shape: a.shape.shape, runnerUp: a.shape.runnerUp, confidence: a.shape.confidence, features: a.shape.features },
    symmetry: { score: a.symmetry.score, asymmetry: a.symmetry.asymmetry, regions: a.symmetry.regions, findings: a.symmetry.findings },
    metrics: a.metrics.map((m) => ({ id: m.id, value: m.value, display: m.display, score: m.score, key: m.key, ideal: m.idealDisplay, details: m.details })),
    quality: a.quality.checks.map((c) => `${c.status}: ${c.title}`),
    points: a.photoPoints,
  }
}

/** Draws the hairline search over the photo, for eyeballing why it succeeded or not. */
;(window as unknown as { hairlineDebug: (url: string) => Promise<string | null> }).hairlineDebug = async (url) => {
  const { toUpright, fromUpright } = await import('../src/face/frame')
  const { estimateHairline, sampleYCC } = await import('../src/face/pixels')
  const blob = await (await fetch(url)).blob()
  const photo = await loadPhoto(blob)
  const det = await detectImage(photo.canvas)
  if (!det) return null
  const px = pixelsOf(photo.canvas)
  const frame = computeFrame(det.landmarks)
  const est = estimateHairline(px, det.landmarks, frame)
  const g = photo.canvas.getContext('2d')!
  const up = (i: number) => toUpright(frame, det.landmarks[i])
  const top = up(10)
  const brow = up(9)
  const h = brow.y - top.y
  const w = Math.hypot(up(234).x - up(454).x, up(234).y - up(454).y)
  const cx = (top.x + up(151).x + brow.x) / 3
  // Skin sample box.
  g.strokeStyle = 'lime'
  const corners = [
    { x: cx - 0.12 * w, y: top.y + 0.3 * h },
    { x: cx + 0.12 * w, y: top.y + 0.3 * h },
    { x: cx + 0.12 * w, y: top.y + 0.75 * h },
    { x: cx - 0.12 * w, y: top.y + 0.75 * h },
  ].map((p) => fromUpright(frame, p))
  g.beginPath()
  corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
  g.closePath()
  g.stroke()
  // Search strip extent.
  for (let y = top.y; y >= top.y - 1.4 * h; y -= Math.max(2, h / 30)) {
    const a = fromUpright(frame, { x: cx - 0.1 * w, y })
    const b = fromUpright(frame, { x: cx + 0.1 * w, y })
    const s = sampleYCC(px, (a.x + b.x) / 2, (a.y + b.y) / 2)
    g.strokeStyle = s ? 'rgba(0,200,255,0.5)' : 'red'
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.stroke()
  }
  if (est.point) {
    g.fillStyle = 'red'
    g.fillRect(est.point.x - 30, est.point.y - 1.5, 60, 3)
  }
  g.fillStyle = 'yellow'
  g.font = '16px sans-serif'
  g.fillText(`conf ${est.confidence.toFixed(2)} covered ${est.covered}`, 10, 20)
  return photo.canvas.toDataURL('image/jpeg', 0.85)
}
