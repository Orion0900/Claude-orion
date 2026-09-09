import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { bearingTo, destination, type LatLng } from '../lib/geo'
import type { Course, Hole } from '../lib/course'
import { targetOf } from '../lib/course'
import type { Shot } from '../lib/shots'
import { formatDistance, type Unit } from '../lib/units'

export type TapMode = 'none' | 'pin' | 'tee' | 'me'

interface MapViewProps {
  course: Course | null
  hole: Hole | null
  position: LatLng | null
  accuracy: number | null
  /** Where the advisor wants the ball to land, meters from the player. */
  aim: number | null
  shots: Shot[]
  unit: Unit
  tapMode: TapMode
  onTap: (point: LatLng) => void
  /** Bumped by the parent to ask for the view to be re-framed on the hole. */
  frameKey: number
}

const FALLBACK_VIEW: [number, number] = [42.3601, -71.0589]

const FLAG_ICON = L.divIcon({
  className: 'flag-icon',
  html:
    '<svg viewBox="0 0 24 32" width="26" height="34">' +
    '<path d="M4 31V2" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path class="cloth" d="M5 3h13l-4 5 4 5H5z" fill="#cf3b34"/></svg>',
  iconSize: [26, 34],
  iconAnchor: [4, 33],
})

const TEE_ICON = L.divIcon({
  className: 'tee-icon',
  html: '<span></span>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

function distanceLabel(text: string): L.DivIcon {
  return L.divIcon({ className: 'distance-label', html: `<span>${text}</span>`, iconSize: undefined })
}

export function MapView({ course, hole, position, accuracy, aim, shots, unit, tapMode, onTap, frameKey }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const courseLayer = useRef<L.LayerGroup | null>(null)
  const holeLayer = useRef<L.LayerGroup | null>(null)
  const lineLayer = useRef<L.LayerGroup | null>(null)
  const shotLayer = useRef<L.LayerGroup | null>(null)
  const meLayer = useRef<L.LayerGroup | null>(null)
  const onTapRef = useRef(onTap)
  onTapRef.current = onTap

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView(FALLBACK_VIEW, 15)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    map.on('click', (event: L.LeafletMouseEvent) => onTapRef.current({ lat: event.latlng.lat, lng: event.latlng.lng }))
    courseLayer.current = L.layerGroup().addTo(map)
    holeLayer.current = L.layerGroup().addTo(map)
    lineLayer.current = L.layerGroup().addTo(map)
    shotLayer.current = L.layerGroup().addTo(map)
    meLayer.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Hazards for the whole course.
  useEffect(() => {
    const layer = courseLayer.current
    if (!layer) return
    layer.clearLayers()
    for (const hazard of course?.hazards ?? []) {
      L.polygon(hazard.polygon, {
        color: hazard.kind === 'water' ? '#60a5fa' : '#fcd34d',
        fillColor: hazard.kind === 'water' ? '#3b82f6' : '#fde68a',
        fillOpacity: 0.35,
        weight: 1,
        interactive: false,
      }).addTo(layer)
    }
  }, [course])

  // The hole: green outline, tee, flag.
  useEffect(() => {
    const layer = holeLayer.current
    if (!layer) return
    layer.clearLayers()
    if (!hole) return
    if (hole.outline) {
      L.polygon(hole.outline, { color: '#0e7a3c', fillColor: '#22c55e', fillOpacity: 0.3, weight: 2, interactive: false }).addTo(layer)
    }
    if (hole.tee) L.marker(hole.tee, { icon: TEE_ICON, interactive: false }).addTo(layer)
    L.marker(targetOf(hole), { icon: FLAG_ICON, interactive: false }).addTo(layer)
  }, [hole])

  // The line from the player to the flag, with the number on it.
  useEffect(() => {
    const layer = lineLayer.current
    if (!layer) return
    layer.clearLayers()
    if (!hole || !position) return
    const target = targetOf(hole)
    L.polyline([position, target], { color: '#101a14', weight: 5, opacity: 0.35, interactive: false }).addTo(layer)
    L.polyline([position, target], { color: '#ffffff', weight: 3, dashArray: '7 9', interactive: false }).addTo(layer)
    const meters = L.latLng(position).distanceTo(target)
    if (aim !== null && aim > 0 && aim < meters) {
      // Where the caddie wants the ball to finish, with its number on it.
      const landing = destination(position, bearingTo(position, target), aim)
      L.circleMarker(landing, { radius: 10, color: '#e09612', weight: 3, fillOpacity: 0, dashArray: '4 4', interactive: false }).addTo(layer)
      L.marker(landing, { icon: distanceLabel(formatDistance(aim, unit)), interactive: false }).addTo(layer)
    }
  }, [hole, position, aim, unit])

  // Shots already played on this hole.
  useEffect(() => {
    const layer = shotLayer.current
    if (!layer) return
    layer.clearLayers()
    for (const shot of shots) {
      L.circleMarker(shot.start, { radius: 4, color: '#ffffff', fillColor: '#101a14', fillOpacity: 1, weight: 2, interactive: false }).addTo(layer)
      if (shot.end) {
        L.polyline([shot.start, shot.end], { color: '#101a14', weight: 2, opacity: 0.45, interactive: false }).addTo(layer)
      }
    }
  }, [shots])

  // The player.
  useEffect(() => {
    const layer = meLayer.current
    if (!layer) return
    layer.clearLayers()
    if (!position) return
    if (accuracy && accuracy > 5) {
      L.circle(position, { radius: accuracy, color: '#3b82f6', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(layer)
    }
    L.circleMarker(position, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#0a6f95', fillOpacity: 1, interactive: false }).addTo(layer)
  }, [position, accuracy])

  // Frame the hole when it changes, when the player first appears, or when asked to.
  const hasPosition = position !== null
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const points: LatLng[] = []
    if (hole) {
      points.push(targetOf(hole))
      if (hole.tee) points.push(hole.tee)
    }
    if (position) points.push(position)
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 17)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 18 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole?.number, course?.id, frameKey, hasPosition])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.classList.toggle('map-tapping', tapMode !== 'none')
  }, [tapMode])

  // Leaflet sizes itself once; a layout change afterwards needs a nudge.
  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!map || !container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" />
      {tapMode !== 'none' && (
        <div className="map-hint">
          {tapMode === 'pin' && '📍 Tap the flag'}
          {tapMode === 'tee' && '📍 Tap the tee'}
          {tapMode === 'me' && '📍 Tap your ball'}
        </div>
      )}
    </div>
  )
}
