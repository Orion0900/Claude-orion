import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../lib/geo'
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
  onSelect: (id: string) => void
  onPickStart: (point: LatLng) => void
  status: string | null
}

const FALLBACK_VIEW: [number, number] = [42.3601, -71.0589]

export function MapView({
  start,
  routes,
  selectedId,
  cursor,
  position,
  navigating,
  heading,
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

    for (const route of routes) {
      const isSelected = route.id === selectedId
      const line = L.polyline(
        route.path.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: isSelected ? '#4ade80' : '#7c8798',
          weight: isSelected ? 5 : 3,
          opacity: isSelected ? 1 : 0.5,
          lineJoin: 'round',
        },
      )
      line.on('click', (event) => {
        L.DomEvent.stopPropagation(event)
        onSelectRef.current(route.id)
      })
      layer.addLayer(line)
      if (isSelected) line.bringToFront()
    }

    startMarkerRef.current?.bringToFront()

    const selected = routes.find((route) => route.id === selectedId)
    if (selected) {
      map.fitBounds(
        L.latLngBounds(selected.path.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [48, 48] },
      )
    }
  }, [routes, selectedId])

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
  }, [position])

  return renderMap()

  function renderMap() {
    return (
      <div className="map">
        <div className={navigating ? 'map-viewport navigating' : 'map-viewport'}>
          <div
            className="map-rotor"
            style={
              navigating
                ? {
                    // Shift the map down so the runner sits low on screen with
                    // the road ahead filling the view. North-up until a heading
                    // is known, then the map turns to face the way you're going.
                    transform: `translate(-50%, -50%) translateY(12%) rotateX(52deg) rotate(${-(heading ?? 0)}deg)`,
                  }
                : undefined
            }
          >
            <div ref={containerRef} className="map-canvas" role="application" aria-label="Route map" />
          </div>
        </div>
        {status ? <div className="map-overlay">{status}</div> : null}
      </div>
    )
  }
}

