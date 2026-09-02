import type { RouteResult } from './routeSearch'
import { resample } from './geo'

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string,
  )

/**
 * GPX 1.1 track, ready to import into a watch or Strava. Elevation samples are
 * sparser than the route geometry, so each track point takes the elevation of
 * the nearest sample rather than inventing values.
 */
export function toGpx(route: RouteResult, name: string): string {
  const samples = resample(route.path, route.profile.elevations.length || 1)
  const elevationAt = (index: number) => {
    if (!route.profile.elevations.length) return undefined
    const ratio = route.path.length <= 1 ? 0 : index / (route.path.length - 1)
    const sampleIndex = Math.round(ratio * (samples.length - 1))
    return route.profile.elevations[Math.min(sampleIndex, route.profile.elevations.length - 1)]
  }

  const points = route.path
    .map((p, i) => {
      const ele = elevationAt(i)
      const eleTag = ele === undefined ? '' : `<ele>${ele.toFixed(1)}</ele>`
      return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${eleTag}</trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LoopMaker" xmlns="http://www.topografix.com/GPX/1/1">
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

export function downloadGpx(route: RouteResult, name: string): void {
  const blob = new Blob([toGpx(route, name)], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}.gpx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
