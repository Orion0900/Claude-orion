import type { RouteResult } from './routeSearch'
import { cumulativeDistances } from './geo'

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string,
  )

/**
 * GPX 1.1 track, ready to import into a bike computer, Komoot or Strava. Elevation samples are
 * sparser than the route geometry, so each track point takes the elevation of
 * the nearest sample rather than inventing values.
 */
export function toGpx(route: RouteResult, name: string): string {
  const elevations = route.profile.elevations
  const cumulative = cumulativeDistances(route.path)
  const total = cumulative[cumulative.length - 1] ?? 0

  // Samples are spaced evenly by distance, but a routing engine's vertices are
  // not: dense through bends, sparse along a straight. Matching them by
  // position in the list would put the hills in the wrong part of the ride.
  const elevationAt = (index: number) => {
    if (elevations.length === 0) return undefined
    const ratio = total === 0 ? 0 : cumulative[index] / total
    const sampleIndex = Math.round(ratio * (elevations.length - 1))
    return elevations[Math.min(Math.max(sampleIndex, 0), elevations.length - 1)]
  }

  const points = route.path
    .map((p, i) => {
      const ele = elevationAt(i)
      const eleTag = ele === undefined ? '' : `<ele>${ele.toFixed(1)}</ele>`
      return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${eleTag}</trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="EasyPedal" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`
}
