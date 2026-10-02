import { memo, type ReactElement } from 'react'
import { TRIANGLES } from '../../face/canonical'
import type { FrontAnalysis } from '../../face/analyze'
import { FACE_OVAL } from '../../face/indices'
import { Annotated, fitBox } from './Annotated'
import type { PhotoRef } from './MetricCard'

/**
 * Green up to about 1% of face width (where most faces sit), gold around 2%,
 * coral from 3.5%.
 */
export function asymmetryColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 3.5))
  const stops: [number, number[]][] = [
    [0, [130, 211, 163]],
    [0.57, [217, 183, 123]],
    [1, [239, 139, 116]],
  ]
  const i = t < 0.57 ? 0 : 1
  const [t0, c0] = stops[i]
  const [t1, c1] = stops[i + 1]
  const k = (t - t0) / (t1 - t0)
  const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/**
 * The face mesh over the photo, each triangle tinted by how far its corners
 * sit from their mirrored partners.
 */
function SymmetryMapImpl({ front, photo }: { front: FrontAnalysis; photo: PhotoRef }) {
  const lm = front.display.landmarks
  const per = front.symmetry.perPoint
  const oval = FACE_OVAL.map((i) => lm[i])
  const xs = oval.map((p) => p.x)
  const ys = oval.map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs)
  const box = fitBox({ x: Math.min(...xs) - 0.08 * w, y: Math.min(...ys) - 0.08 * w, w: w * 1.16, h: Math.max(...ys) - Math.min(...ys) + 0.16 * w }, 3 / 4)
  const tris: ReactElement[] = []
  for (let t = 0; t < TRIANGLES.length; t += 3) {
    const [a, b, c] = [TRIANGLES[t], TRIANGLES[t + 1], TRIANGLES[t + 2]]
    const v = (per[a] + per[b] + per[c]) / 3
    tris.push(
      <polygon
        key={t}
        points={`${lm[a].x},${lm[a].y} ${lm[b].x},${lm[b].y} ${lm[c].x},${lm[c].y}`}
        fill={asymmetryColor(v)}
        fillOpacity={0.42}
        stroke={asymmetryColor(v)}
        strokeOpacity={0.5}
        strokeWidth={box.w / 900}
      />,
    )
  }
  const top = lm[10]
  const bottom = lm[152]
  return (
    <Annotated src={photo.src} width={photo.width} height={photo.height} frame={photo.frame} overlay={{ box, shapes: [] }} aspect={3 / 4} dim={0.3}>
      {tris}
      <line x1={top.x} y1={top.y - 0.06 * w} x2={bottom.x} y2={bottom.y + 0.04 * w} stroke="#fff" strokeWidth={box.w / 400} strokeDasharray={`${box.w / 80} ${box.w / 110}`} opacity={0.8} />
    </Annotated>
  )
}

export const SymmetryMap = memo(SymmetryMapImpl)
