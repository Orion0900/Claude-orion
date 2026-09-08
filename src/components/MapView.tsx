import { useEffect, useRef, type CSSProperties } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { splitPath, type LatLng } from '../lib/geo'
import type { RouteResult } from '../lib/routeSearch'

interface MapViewProps {
  start: LatLng | null
  routes: RouteResult[]
  selectedId: string | null
  /** Point highlighted while scrubbing an elevation profile. */
  cursor: LatLng | null
  /** Live GPS position while following a route. */
  position: LatLng | null
  /** True while a run is in progress: tilts the view and takes the map off the finger. */
  navigating: boolean
  /** Heading to point the map along, in degrees. Null until the runner moves. */
  heading: number | null
  /** How far through the route the runner is, 0-1, for dimming ground covered. */
  traveled: number
  onSelect: (id: string) => void
  onPickStart: (point: LatLng) => void
  status: string | null
}

const FALLBACK_VIEW: [number, number] = [42.3601, -71.0589]

/**
 * Where the runner sits on screen while navigating, as a percentage down the
 * viewport, and how much bigger the rotor is than the viewport.
 *
 * These two numbers place both the camera and the puck. Leaflet pans the map so
 * the runner is at the rotor's centre, so the rotor is shifted until that centre
 * lands on the puck — and because the shift is expressed in the rotor's own
 * size, it has to be divided by the rotor's scale. Get this wrong and the map
 * is centred somewhere the puck isn't, which is exactly how the runner ends up
 * hidden behind the bottom card.
 */
const PUCK_Y = 62
/** Tilting pushes the rotor's far edge up-screen; oversizing hides that seam. */
const ROTOR_SCALE = 2.6
const ROTOR_SHIFT = (PUCK_Y - 50) / ROTOR_SCALE

export function MapView({
  start,
  routes,
  selectedId,
  cursor,
  position,
  navigating,
  heading,
  traveled,
  onSelect,
  onPickStart,
  status,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const startMarkerRef = useRef<L.CircleMarker | null>(null)
  const cursorMarkerRef = useRef<L.CircleMarker | null>(null)
  const positionMarkerRef = useRef<L.CircleMarker | null>(null)
  // Handlers change every render; a ref keeps the Leaflet listener stable.
  const onPickStartRef = useRef(onPickStart)
  const onSelectRef = useRef(onSelect)
  onPickStartRef.current = onPickStart
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(
      FALLBACK_VIEW,
      14,
    )
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    map.on('click', (event: L.LeafletMouseEvent) => {
      onPickStartRef.current({ lat: event.latlng.lat, lng: event.latlng.lng })
    })

    routeLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      routeLayerRef.current = null
      startMarkerRef.current = null
      cursorMarkerRef.current = null
      positionMarkerRef.current = null
    }
  }, [])

  // Start marker follows the chosen location; the map only recentres when the
  // runner moves somewhere genuinely new, not on every route selection.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !start) return
    const latlng = L.latLng(start.lat, start.lng)

    if (startMarkerRef.current) {
      startMarkerRef.current.setLatLng(latlng)
    } else {
      startMarkerRef.current = L.circleMarker(latlng, {
        radius: 7,
        color: '#0f1115',
        weight: 3,
        fillColor: '#4ade80',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip('Start & finish')
    }
    if (!map.getBounds().contains(latlng)) map.setView(latlng, 14)
  }, [start])

  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    const toLatLngs = (points: LatLng[]) => points.map((p) => [p.lat, p.lng] as [number, number])

    for (const route of routes) {
      const isSelected = route.id === selectedId

      // Navigating shows the road ahead brightly and the ground already
      // covered dimmed, so "which way now" reads at a glance.
      if (navigating && isSelected) {
        const [behind, ahead] = splitPath(route.path, traveled)
        layer.addLayer(
          L.polyline(toLatLngs(behind), { color: '#5a6472', weight: 7, opacity: 0.55, lineJoin: 'round' }),
        )
        layer.addLayer(
          L.polyline(toLatLngs(ahead), {
            color: '#4ade80',
            weight: 11,
            opacity: 1,
            lineJoin: 'round',
            lineCap: 'round',
          }),
        )
        continue
      }

      const line = L.polyline(toLatLngs(route.path), {
        color: isSelected ? '#4ade80' : '#7c8798',
        weight: isSelected ? 5 : 3,
        opacity: isSelected ? 1 : 0.5,
        lineJoin: 'round',
      })
      line.on('click', (event) => {
        L.DomEvent.stopPropagation(event)
        onSelectRef.current(route.id)
      })
      layer.addLayer(line)
      if (isSelected) line.bringToFront()
    }

    if (!navigating) startMarkerRef.current?.bringToFront()

    const selected = routes.find((route) => route.id === selectedId)
    if (selected) {
      map.fitBounds(
        L.latLngBounds(selected.path.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [48, 48] },
      )
    }
  }, [routes, selectedId, navigating, traveled])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!cursor) {
      cursorMarkerRef.current?.remove()
      cursorMarkerRef.current = null
      return
    }
    const latlng = L.latLng(cursor.lat, cursor.lng)
    if (cursorMarkerRef.current) {
      cursorMarkerRef.current.setLatLng(latlng)
    } else {
      cursorMarkerRef.current = L.circleMarker(latlng, {
        radius: 6,
        color: '#0f1115',
        weight: 2,
        fillColor: '#fbbf24',
        fillOpacity: 1,
      }).addTo(map)
    }
  }, [cursor])

  // Navigating takes the map away from the finger and gives it to the route.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const handlers = [map.dragging, map.scrollWheelZoom, map.doubleClickZoom, map.touchZoom]
    handlers.forEach((handler) => (navigating ? handler.disable() : handler.enable()))
    // The rotor around the map changes size when navigation starts.
    map.invalidateSize({ animate: false })
    if (navigating) map.setZoom(17)
  }, [navigating])

  // While following, the map tracks the runner rather than the whole route.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!position) {
      positionMarkerRef.current?.remove()
      positionMarkerRef.current = null
      return
    }
    const latlng = L.latLng(position.lat, position.lng)

    // While navigating the runner is drawn as a fixed puck on the glass, so a
    // tilted, squashed map marker would only compete with it.
    if (navigating) {
      positionMarkerRef.current?.remove()
      positionMarkerRef.current = null
      map.panTo(latlng, { animate: true, duration: 0.4 })
      return
    }

    if (positionMarkerRef.current) {
      positionMarkerRef.current.setLatLng(latlng)
    } else {
      positionMarkerRef.current = L.circleMarker(latlng, {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#3b82f6',
        fillOpacity: 1,
      }).addTo(map)
    }
    positionMarkerRef.current.bringToFront()
    map.panTo(latlng, { animate: true })
  }, [position, navigating])

  return renderMap()

  function renderMap() {
    return (
      <div
        className="map"
        style={
          navigating
            ? ({
                '--nav-puck-y': `${PUCK_Y}%`,
                '--nav-rotor-size': `${ROTOR_SCALE * 100}%`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className={navigating ? 'map-viewport navigating' : 'map-viewport'}>
          <div
            className="map-rotor"
            style={
              navigating
                ? {
                    // Shift the map down so the runner sits low on screen with
                    // the road ahead filling the view. North-up until a heading
                    // is known, then the map turns to face the way you're going.
                    transform: `translate(-50%, -50%) translateY(${ROTOR_SHIFT}%) rotateX(52deg) rotate(${-(heading ?? 0)}deg)`,
                  }
                : undefined
            }
          >
            <div ref={containerRef} className="map-canvas" role="application" aria-label="Route map" />
          </div>
        </div>
        {navigating && position ? (
          <div className="nav-puck" aria-hidden="true">
            <span className="nav-puck-halo" />
            <svg viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14" className="nav-puck-body" />
              <path d="M16 8 L23 22 L16 18.5 L9 22 Z" className="nav-puck-chevron" />
            </svg>
          </div>
        ) : null}
        {status ? <div className="map-overlay">{status}</div> : null}
      </div>
    )
  }
}

