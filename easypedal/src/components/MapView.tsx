import { useEffect, useRef, type CSSProperties } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { splitPath, type LatLng } from '../lib/geo'
import { createDoubleTapDetector } from '../lib/gestures'
import type { Priority, RouteResult } from '../lib/routeSearch'
import { isBikeway } from '../lib/bikeway'
import { gradeSegments } from '../lib/grades'

/** Two colours, whichever question is being asked: green is good, red is not. */
export const GOOD_COLOR = '#4ade80'
export const BAD_COLOR = '#f87171'

interface MapViewProps {
  start: LatLng | null
  finish: LatLng | null
  routes: RouteResult[]
  selectedId: string | null
  /** Point highlighted while scrubbing an elevation profile. */
  cursor: LatLng | null
  /** Live GPS position while following a route. */
  position: LatLng | null
  /** True while a ride is in progress: tilts the view and takes the map off the finger. */
  navigating: boolean
  /** Heading to point the map along, in degrees. Null until the rider moves. */
  heading: number | null
  /** How far through the route the rider is, 0-1, for dimming ground covered. */
  traveled: number
  /**
   * True once the rider has panned away to look around. The map flattens and
   * stops chasing them until they re-centre.
   */
  browsing: boolean
  /** Fired when a pan or pinch begins, so navigation can let go of the map. */
  onBrowse: () => void
  /** Fired on a double tap, which puts the rider back in the middle. */
  onRecenter: () => void
  onSelect: (id: string) => void
  /**
   * What the chosen route is painted by: where the bike lanes are, or where
   * the steep climbs are. Follows the rider's priority switch.
   */
  paint: Priority
  /** A tap on the map, to set whichever end the panel is asking for. */
  onPick: (point: LatLng) => void
  status: string | null
}

const FALLBACK_VIEW: [number, number] = [42.3601, -71.0589]

const LEGEND: Record<Priority, { good: string; bad: string }> = {
  lanes: { good: 'Bike lane or path', bad: 'No bike lane' },
  hills: { good: 'Easy going', bad: 'Steep climb (5%+)' },
}

/** The chosen route cut into good and bad stretches for the current paint. */
function paintedStretches(route: RouteResult, paint: Priority): Array<{ path: LatLng[]; good: boolean }> {
  if (paint === 'hills') {
    return gradeSegments(route.path, route.profile).map((segment) => ({
      path: segment.path,
      good: segment.kind === 'easy',
    }))
  }
  return (route.ways?.segments ?? []).map((segment) => ({ path: segment.path, good: isBikeway(segment.kind) }))
}

/**
 * Where the rider sits on screen while navigating, as a percentage down the
 * viewport, and how much bigger the rotor is than the viewport.
 *
 * These two numbers place both the camera and the puck. Leaflet pans the map so
 * the rider is at the rotor's centre, so the rotor is shifted until that centre
 * lands on the puck — and because the shift is expressed in the rotor's own
 * size, it has to be divided by the rotor's scale. Get this wrong and the map
 * is centred somewhere the puck isn't, which is exactly how the rider ends up
 * hidden behind the bottom card.
 */
const PUCK_Y = 62
/** Tilting pushes the rotor's far edge up-screen; oversizing hides that seam. */
const ROTOR_SCALE = 2.6
const ROTOR_SHIFT = (PUCK_Y - 50) / ROTOR_SCALE

export function MapView({
  start,
  finish,
  routes,
  selectedId,
  cursor,
  position,
  navigating,
  heading,
  traveled,
  browsing,
  onBrowse,
  onRecenter,
  onSelect,
  paint,
  onPick,
  status,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.LayerGroup | null>(null)
  const startMarkerRef = useRef<L.CircleMarker | null>(null)
  const finishMarkerRef = useRef<L.CircleMarker | null>(null)
  const cursorMarkerRef = useRef<L.CircleMarker | null>(null)
  const positionMarkerRef = useRef<L.CircleMarker | null>(null)
  // Handlers change every render; a ref keeps the Leaflet listener stable.
  const onPickRef = useRef(onPick)
  const onSelectRef = useRef(onSelect)
  const onBrowseRef = useRef(onBrowse)
  const onRecenterRef = useRef(onRecenter)
  // Read inside Leaflet handlers, which are bound once and outlive any render.
  const navigatingRef = useRef(navigating)
  navigatingRef.current = navigating
  onPickRef.current = onPick
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

    /**
     * Dropping a pin waits out the double-tap window.
     *
     * Leaflet fires a click for each tap of a double tap, and a double tap is
     * this app's re-centre gesture. Acting on the first click immediately
     * would set the start, flip the panel to the destination, and let the
     * second click overwrite the destination with the very same point — so a
     * rider who double taps loses the other end of their ride. Waiting a beat
     * costs nothing a finger can feel.
     */
    const DOUBLE_TAP_MS = 300
    const DOUBLE_TAP_SLOP_PX = 36
    let pendingPin: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null

    const cancelPendingPin = () => {
      if (!pendingPin) return
      clearTimeout(pendingPin.timer)
      pendingPin = null
    }

    map.on('click', (event: L.LeafletMouseEvent) => {
      // Mid-ride the map is a view, not a form: a stray tap must not move the
      // start pin out from under the route being ridden.
      if (navigatingRef.current) return

      const { x, y } = event.containerPoint
      if (pendingPin && Math.hypot(x - pendingPin.x, y - pendingPin.y) <= DOUBLE_TAP_SLOP_PX) {
        cancelPendingPin()
        return
      }
      cancelPendingPin()

      const point = { lat: event.latlng.lat, lng: event.latlng.lng }
      pendingPin = {
        x,
        y,
        timer: setTimeout(() => {
          pendingPin = null
          onPickRef.current(point)
        }, DOUBLE_TAP_MS),
      }
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
    // gesture once the map has been dragged away mid-ride.
    const detector = createDoubleTapDetector()
    const onPointerDown = (event: PointerEvent) => {
      if (detector.tap(event.clientX, event.clientY, event.timeStamp)) onRecenterRef.current()
    }
    container.addEventListener('pointerdown', onPointerDown)

    routeLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      cancelPendingPin()
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('pointerdown', onPointerDown)
      map.remove()
      mapRef.current = null
      routeLayerRef.current = null
      startMarkerRef.current = null
      finishMarkerRef.current = null
      cursorMarkerRef.current = null
      positionMarkerRef.current = null
    }
  }, [])

  // The end markers follow their chosen locations; the map only recentres
  // when a pin lands somewhere genuinely new, not on every route selection.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!start) {
      startMarkerRef.current?.remove()
      startMarkerRef.current = null
      return
    }
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
        .bindTooltip('Start')
    }
    if (!map.getBounds().contains(latlng)) map.setView(latlng, 14)
  }, [start])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!finish) {
      finishMarkerRef.current?.remove()
      finishMarkerRef.current = null
      return
    }
    const latlng = L.latLng(finish.lat, finish.lng)

    if (finishMarkerRef.current) {
      finishMarkerRef.current.setLatLng(latlng)
    } else {
      finishMarkerRef.current = L.circleMarker(latlng, {
        radius: 7,
        color: '#0f1115',
        weight: 3,
        fillColor: '#f87171',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip('Destination')
    }
    // Both pins on screen, so the ride ahead is visible before it's routed.
    if (start) {
      map.fitBounds(L.latLngBounds([latlng, L.latLng(start.lat, start.lng)]), { padding: [48, 48], maxZoom: 15 })
    } else if (!map.getBounds().contains(latlng)) {
      map.setView(latlng, 14)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish])

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
        color: isSelected ? '#e8eaf0' : '#7c8798',
        weight: isSelected ? 7 : 3,
        opacity: isSelected ? 0.9 : 0.5,
        lineJoin: 'round',
      })
      line.on('click', (event) => {
        L.DomEvent.stopPropagation(event)
        onSelectRef.current(route.id)
      })
      layer.addLayer(line)
      if (!isSelected) continue
      line.bringToFront()

      // The chosen route is painted green and red by whichever question the
      // rider asked: where the bike lanes are, or where the steep climbs are.
      for (const segment of paintedStretches(route, paint)) {
        if (segment.path.length < 2) continue
        const stretch = L.polyline(toLatLngs(segment.path), {
          color: segment.good ? GOOD_COLOR : BAD_COLOR,
          weight: 5,
          opacity: 1,
          lineJoin: 'round',
          lineCap: 'round',
          interactive: false,
        })
        layer.addLayer(stretch)
        stretch.bringToFront()
      }
    }

    if (!navigating) {
      startMarkerRef.current?.bringToFront()
      finishMarkerRef.current?.bringToFront()
    }

    // Framing the whole route is what you want when choosing one, and exactly
    // what you don't want mid-ride: the follow camera is tracking the rider,
    // and this runs on every GPS fix, so it would yank the map back from
    // wherever they had panned to look ahead.
    const selected = routes.find((route) => route.id === selectedId)
    if (selected && !navigating) {
      map.fitBounds(
        L.latLngBounds(selected.path.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [48, 48] },
      )
    }
  }, [routes, selectedId, navigating, traveled, paint])

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
    // Dragging and pinching stay enabled while navigating so the rider can
    // look ahead; only double-click zoom is taken over, for re-centring.
    if (navigating) map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
    // The rotor is oversized while the tilted camera is on and normal size
    // otherwise, so Leaflet has to be told the container changed shape —
    // both when navigation starts and each time the rider flattens it to
    // look around.
    map.invalidateSize({ animate: false })
    if (navigating && !browsing) map.setZoom(17)
  }, [navigating, browsing])

  // While following, the map tracks the rider rather than the whole route.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!position) {
      positionMarkerRef.current?.remove()
      positionMarkerRef.current = null
      return
    }
    const latlng = L.latLng(position.lat, position.lng)

    // While navigating the rider is drawn as a fixed puck on the glass, so a
    // tilted, squashed map marker would only compete with it.
    if (navigating) {
      positionMarkerRef.current?.remove()
      positionMarkerRef.current = null
      if (!browsing) map.panTo(latlng, { animate: true, duration: 0.4 })
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
  }, [position, navigating, browsing])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !navigating || browsing || !position) return
    map.setView([position.lat, position.lng], 17, { animate: true })
  }, [browsing, navigating, position])

  return renderMap()

  function renderMap() {
    return (
      <div
        className={navigating ? 'map in-run' : 'map'}
        style={
          navigating
            ? ({
                '--nav-puck-y': `${PUCK_Y}%`,
                '--nav-rotor-size': `${ROTOR_SCALE * 100}%`,
              } as CSSProperties)
            : undefined
        }
      >
        <div
          className={
            navigating && !browsing ? 'map-viewport navigating' : 'map-viewport'
          }
        >
          <div
            className="map-rotor"
            style={
              navigating && !browsing
                ? {
                    // Shift the map down so the rider sits low on screen with
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
        {!navigating && routes.some((route) => route.id === selectedId && (paint === 'hills' || route.ways)) ? (
          <div className="map-legend" aria-label="What the colours mean">
            <span>
              <i style={{ background: GOOD_COLOR }} />
              {LEGEND[paint].good}
            </span>
            <span>
              <i style={{ background: BAD_COLOR }} />
              {LEGEND[paint].bad}
            </span>
          </div>
        ) : null}
      </div>
    )
  }
}

