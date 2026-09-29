import { useEffect, useRef, useState, type CSSProperties } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cameraFor } from '../lib/camera'
import { splitPath, type LatLng } from '../lib/geo'
import { createDoubleTapDetector } from '../lib/gestures'
import type { MapPerspective } from '../lib/preferences'
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
  /** Third-person tilted view, or flat on. Both follow the runner. */
  perspective: MapPerspective
  /** How far through the route the runner is, 0-1, for dimming ground covered. */
  traveled: number
  /**
   * True once the runner has panned away to look around. The map flattens and
   * stops chasing them until they re-centre.
   */
  browsing: boolean
  /** Fired when a pan or pinch begins, so navigation can let go of the map. */
  onBrowse: () => void
  /** Fired on a double tap, which puts the runner back in the middle. */
  onRecenter: () => void
  /** A way back to the route after straying from it, drawn dashed. */
  detour: LatLng[] | null
  onSelect: (id: string) => void
  onPickStart: (point: LatLng) => void
  status: string | null
}

const FALLBACK_VIEW: [number, number] = [42.3601, -71.0589]

/** Where the runner sits on screen while navigating, as a fraction down it. */
const PUCK_FRACTION = 0.62

/** Street level: close enough to read the next junction, far enough to see it coming. */
const NAV_ZOOM = 17

/**
 * How long the map takes to glide to each new fix. About the gap between fixes,
 * and linear, so the map moves continuously the way a navigation app's does
 * rather than lurching once a second.
 */
const GLIDE_SECONDS = 0.9

export function MapView({
  start,
  routes,
  selectedId,
  cursor,
  position,
  navigating,
  heading,
  perspective,
  traveled,
  browsing,
  onBrowse,
  onRecenter,
  detour,
  onSelect,
  onPickStart,
  status,
}: MapViewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const startMarkerRef = useRef<L.CircleMarker | null>(null)
  const cursorMarkerRef = useRef<L.CircleMarker | null>(null)
  const positionMarkerRef = useRef<L.CircleMarker | null>(null)
  // The route while running, as two lines updated in place on every fix.
  const behindLineRef = useRef<L.Polyline | null>(null)
  const aheadLineRef = useRef<L.Polyline | null>(null)
  const detourLineRef = useRef<L.Polyline | null>(null)
  // Whether the map has been put on the runner since following (re)started.
  const followingRef = useRef(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  // Handlers change every render; a ref keeps the Leaflet listener stable.
  const onPickStartRef = useRef(onPickStart)
  const onSelectRef = useRef(onSelect)
  const onBrowseRef = useRef(onBrowse)
  const onRecenterRef = useRef(onRecenter)
  onPickStartRef.current = onPickStart
  onSelectRef.current = onSelect
  onBrowseRef.current = onBrowse
  onRecenterRef.current = onRecenter

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

    // A pan or pinch means "let me look around"; navigation hands over the map.
    // Leaflet's own dragstart covers the mouse, but a finger is watched
    // directly rather than trusting the library's internals to fire first.
    map.on('dragstart', () => onBrowseRef.current())
    const container = map.getContainer()
    const PAN_SLOP_PX = 10
    let touchOrigin: { x: number; y: number } | null = null

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        onBrowseRef.current()
        touchOrigin = null
        return
      }
      const touch = event.touches[0]
      touchOrigin = touch ? { x: touch.clientX, y: touch.clientY } : null
    }
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touchOrigin || !touch) return
      if (Math.hypot(touch.clientX - touchOrigin.x, touch.clientY - touchOrigin.y) > PAN_SLOP_PX) {
        onBrowseRef.current()
        touchOrigin = null
      }
    }
    const onTouchEnd = () => {
      touchOrigin = null
    }
    const onWheel = () => onBrowseRef.current()

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: true })
    container.addEventListener('touchend', onTouchEnd, { passive: true })
    container.addEventListener('wheel', onWheel, { passive: true })

    // Double tap re-centres rather than zooming, which is the more useful
    // gesture once the map has been dragged away mid-run.
    const detector = createDoubleTapDetector()
    const onPointerDown = (event: PointerEvent) => {
      if (detector.tap(event.clientX, event.clientY, event.timeStamp)) onRecenterRef.current()
    }
    container.addEventListener('pointerdown', onPointerDown)

    routeLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('pointerdown', onPointerDown)
      map.remove()
      mapRef.current = null
      routeLayerRef.current = null
      startMarkerRef.current = null
      cursorMarkerRef.current = null
      positionMarkerRef.current = null
    }
  }, [])

  // The camera is sized from the screen, so it has to know when that changes.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const { width, height } = frame.getBoundingClientRect()
      setViewport((current) =>
        Math.round(current.width) === Math.round(width) && Math.round(current.height) === Math.round(height)
          ? current
          : { width, height },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
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

  // The route lines. Rebuilt only when the routes or the mode change — never
  // per GPS fix, which is what used to refit the whole route and throw the
  // map from street level to an overview and back every second of a run.
  useEffect(() => {
    const map = mapRef.current
    const layer = routeLayerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    behindLineRef.current = null
    aheadLineRef.current = null

    const toLatLngs = (points: LatLng[]) => points.map((p) => [p.lat, p.lng] as [number, number])
    const selected = routes.find((route) => route.id === selectedId)

    // Running: just your route, the road ahead bright and the ground already
    // covered dimmed, so "which way now" reads at a glance.
    if (navigating) {
      if (!selected) return
      behindLineRef.current = L.polyline([], {
        color: '#5a6472',
        weight: 7,
        opacity: 0.55,
        lineJoin: 'round',
        interactive: false,
      }).addTo(layer)
      aheadLineRef.current = L.polyline(toLatLngs(selected.path), {
        color: '#4ade80',
        weight: 11,
        opacity: 1,
        lineJoin: 'round',
        lineCap: 'round',
        interactive: false,
      }).addTo(layer)
      return
    }

    for (const route of routes) {
      const isSelected = route.id === selectedId
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

    startMarkerRef.current?.bringToFront()

    if (selected) {
      map.fitBounds(L.latLngBounds(toLatLngs(selected.path)), { padding: [48, 48] })
    }
  }, [routes, selectedId, navigating])

  // Progress along the route only moves the join between the two lines.
  useEffect(() => {
    const selected = routes.find((route) => route.id === selectedId)
    if (!navigating || !selected || !aheadLineRef.current || !behindLineRef.current) return
    const [behind, ahead] = splitPath(selected.path, traveled)
    const toLatLngs = (points: LatLng[]) => points.map((p) => [p.lat, p.lng] as [number, number])
    behindLineRef.current.setLatLngs(toLatLngs(behind))
    aheadLineRef.current.setLatLngs(toLatLngs(ahead))
  }, [routes, selectedId, navigating, traveled])

  // The way back after going off route, dashed like a navigation app's reroute.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    detourLineRef.current?.remove()
    detourLineRef.current = null
    if (!navigating || !detour || detour.length < 2) return
    detourLineRef.current = L.polyline(
      detour.map((p) => [p.lat, p.lng] as [number, number]),
      { color: '#1a73e8', weight: 8, opacity: 0.95, dashArray: '2 14', lineCap: 'round', interactive: false },
    ).addTo(map)
  }, [detour, navigating])

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

  const camera =
    navigating && !browsing && viewport.width > 0
      ? cameraFor({ ...viewport, puckFraction: PUCK_FRACTION, perspective })
      : null

  // Navigating takes over double-tap for re-centring; dragging and pinching
  // stay enabled so the runner can look ahead.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (navigating) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
  }, [navigating])

  // The rotor changes size with the camera, so Leaflet has to be told its
  // container changed shape, and the runner put back in the middle of it.
  const rotorSize = camera?.rotorSize ?? null
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.invalidateSize({ animate: false })
    followingRef.current = false
  }, [rotorSize, navigating, browsing])

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
      if (browsing) return
      if (!followingRef.current || map.getZoom() !== NAV_ZOOM) {
        // Starting out, or coming back from looking around: jump, don't fly.
        map.setView(latlng, NAV_ZOOM, { animate: false })
        followingRef.current = true
      } else {
        map.panTo(latlng, { animate: true, duration: GLIDE_SECONDS, easeLinearity: 1, noMoveStart: true })
      }
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
  }, [position, navigating, browsing, rotorSize])

  return renderMap()

  function renderMap() {
    return (
      <div
        ref={frameRef}
        className={navigating ? 'map in-run' : 'map'}
        style={
          navigating
            ? ({
                '--nav-puck-y': `${PUCK_FRACTION * 100}%`,
                // A flat map needs no vanishing point.
                '--nav-perspective': camera?.perspectivePx ? `${camera.perspectivePx}px` : 'none',
              } as CSSProperties)
            : undefined
        }
      >
        <div
          className={
            camera ? `map-viewport navigating${camera.tilt === 0 ? ' flat' : ''}` : 'map-viewport'
          }
        >
          <div
            className="map-rotor"
            style={
              camera
                ? {
                    // A square, sized so that whichever way it turns the screen
                    // stays covered, centred on the runner. North-up until a
                    // heading is known, then turned to face the way you're going.
                    width: `${camera.rotorSize}px`,
                    height: `${camera.rotorSize}px`,
                    transform:
                      `translate(-50%, -50%) translateY(${camera.shiftY}px) ` +
                      (camera.tilt ? `rotateX(${camera.tilt}deg) ` : '') +
                      `rotate(${-(heading ?? 0)}deg)`,
                  }
                : undefined
            }
          >
            <div ref={containerRef} className="map-canvas" role="application" aria-label="Route map" />
          </div>
        </div>
        {navigating && !browsing && position ? (
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

