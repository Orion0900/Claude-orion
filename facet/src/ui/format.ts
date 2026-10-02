/** How each measurement's numbers read on gauges and ranges. */
const DEGREES = new Set([
  'canthalTilt',
  'browTilt',
  'nasofrontal',
  'nasolabial',
  'nasofacial',
  'nasomental',
  'convexity',
  'mentolabial',
  'cervicomental',
  'gonial',
  'mentocervical',
])

export function formatValue(id: string, n: number): string {
  if (DEGREES.has(id)) return `${Math.round(n)}°`
  if (id === 'thirds' || id === 'fifths') return `${Math.round(n)}`
  if (id === 'eyeSeparation') return `${Math.round(n * 100)}%`
  if (id === 'eLineUpper' || id === 'eLineLower') return `${n > 0 ? '+' : ''}${Math.round(n)}`
  if (id === 'faceIndex') return `${Math.round(n * 100)}`
  if (Math.abs(n) >= 10) return n.toFixed(0)
  return n.toFixed(2).replace(/0$/, '')
}

/** The unit spelled out after a range, where the numbers alone are unclear. */
export function unitNote(id: string): string {
  if (id === 'thirds' || id === 'fifths') return 'points off an even split'
  if (id === 'eLineUpper' || id === 'eLineLower') return 'mm from the line'
  return ''
}

export function formatDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
