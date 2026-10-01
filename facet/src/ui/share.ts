import { METRIC_TEXT } from '../content/metrics'
import { SHAPE_TEXT } from '../content/shapes'
import { decodeImage } from '../detect/image'
import { FACE_OVAL } from '../face/indices'
import type { Computed } from '../store/analysis'
import type { StoredAnalysis } from '../store/db'
import { verdictOf } from './components/MetricCard'
import { formatDate } from './format'

const W = 1080
const H = 1350
const SERIF = "'New York', 'Iowan Old Style', Georgia, serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

/** A portrait card of the headline results, as a PNG. */
export async function summaryCard({ analysis, computed, photoUrl }: { analysis: StoredAnalysis; computed: Computed; photoUrl: string }): Promise<Blob> {
  const { front, harmony } = computed
  const img = await decodeImage(await (await fetch(photoUrl)).blob())
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#0b0b0e'
  g.fillRect(0, 0, W, H)

  // The face, upright, cropped to the outline, with its thirds.
  const lm = front.display.landmarks
  const oval = FACE_OVAL.map((i) => lm[i])
  const P = front.display.points
  const minX = Math.min(...oval.map((p) => p.x))
  const maxX = Math.max(...oval.map((p) => p.x))
  const top = Math.min(P.tr.y, ...oval.map((p) => p.y))
  const bottom = Math.max(...oval.map((p) => p.y))
  const fw = maxX - minX
  const box = { x: minX - 0.18 * fw, y: top - 0.12 * fw, w: fw * 1.36, h: bottom - top + 0.22 * fw }
  const area = { x: 60, y: 150, w: 560, h: 760 }
  const s = Math.min(area.w / box.w, area.h / box.h)
  const ox = area.x + (area.w - box.w * s) / 2
  const oy = area.y + (area.h - box.h * s) / 2
  g.save()
  g.beginPath()
  g.roundRect(area.x, area.y, area.w, area.h, 28)
  g.clip()
  g.fillStyle = '#000'
  g.fillRect(area.x, area.y, area.w, area.h)
  g.translate(ox - box.x * s, oy - box.y * s)
  g.scale(s, s)
  g.save()
  g.translate(front.frame.center.x, front.frame.center.y)
  g.rotate(-front.frame.angle)
  g.translate(-front.frame.center.x, -front.frame.center.y)
  g.drawImage(img, 0, 0, analysis.front.width, analysis.front.height)
  g.restore()
  g.fillStyle = 'rgba(0,0,0,0.18)'
  g.fillRect(box.x, box.y, box.w, box.h)
  g.strokeStyle = '#d9b77b'
  g.lineWidth = 2.2 / s
  g.setLineDash([10 / s, 8 / s])
  for (const y of [P.tr.y, P.g.y, P.sn.y, P.me.y]) {
    g.beginPath()
    g.moveTo(P.zyR.x - 0.06 * fw, y)
    g.lineTo(P.zyL.x + 0.06 * fw, y)
    g.stroke()
  }
  g.setLineDash([])
  g.beginPath()
  oval.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
  g.closePath()
  g.strokeStyle = 'rgba(255,255,255,0.7)'
  g.lineWidth = 1.6 / s
  g.stroke()
  g.restore()

  // Header.
  g.fillStyle = '#f3efe8'
  g.font = `600 52px ${SERIF}`
  g.fillText('Facet', 60, 98)
  g.fillStyle = '#77726b'
  g.font = `500 26px ${SANS}`
  g.textAlign = 'right'
  g.fillText(analysis.demo ? 'Demo analysis' : formatDate(analysis.createdAt), W - 60, 96)
  g.textAlign = 'left'

  // Scores.
  const col = 670
  const stat = (label: string, value: string, y: number, color: string) => {
    g.fillStyle = '#77726b'
    g.font = `700 22px ${SANS}`
    g.fillText(label.toUpperCase(), col, y)
    g.fillStyle = color
    g.font = `600 118px ${SERIF}`
    g.fillText(value, col - 4, y + 112)
  }
  stat('Harmony', `${harmony}`, 200, '#d9b77b')
  stat('Symmetry', `${Math.round(front.symmetry.score)}%`, 400, '#86d2c6')
  g.fillStyle = '#77726b'
  g.font = `700 22px ${SANS}`
  g.fillText('FACE SHAPE', col, 600)
  g.fillStyle = '#f3efe8'
  g.font = `600 56px ${SERIF}`
  g.fillText(SHAPE_TEXT[front.shape.shape]?.name ?? front.shape.shape, col, 668)

  // Best proportions.
  const best = computed.metrics
    .filter((m) => m.score !== undefined && m.weight > 0)
    .sort((a, b) => b.score! - a.score!)
    .slice(0, 4)
  g.fillStyle = '#77726b'
  g.font = `700 22px ${SANS}`
  g.fillText('STRONGEST PROPORTIONS', 60, 980)
  best.forEach((m, i) => {
    const y = 1035 + i * 64
    const text = METRIC_TEXT[m.id]
    g.fillStyle = '#82d3a3'
    g.beginPath()
    g.arc(72, y - 10, 8, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#f3efe8'
    g.font = `600 32px ${SANS}`
    g.fillText(text?.title ?? m.id, 96, y)
    g.fillStyle = '#b1aca3'
    g.font = `500 30px ${SANS}`
    g.textAlign = 'right'
    g.fillText(`${m.display}  ·  ${verdictOf(m)}`, W - 60, y)
    g.textAlign = 'left'
  })

  g.fillStyle = '#4d4a45'
  g.font = `500 22px ${SANS}`
  g.fillText('Measured on-device. Ideals are research averages, not a verdict.', 60, H - 50)

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t draw the card'))), 'image/png'))
}

/** Opens the share sheet with the card, or downloads it where sharing files isn't supported. */
export async function shareSummary(args: { analysis: StoredAnalysis; computed: Computed; photoUrl: string }): Promise<void> {
  const blob = await summaryCard(args)
  const file = new File([blob], 'facet-summary.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My Facet analysis' })
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
