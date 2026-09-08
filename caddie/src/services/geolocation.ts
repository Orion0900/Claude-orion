/**
 * The player's position, watched continuously and filtered so that a bad
 * fix under the trees doesn't become a bad yardage.
 */
import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '../lib/geo'
import { createFixFilter } from '../lib/gpsFilter'

export interface GpsState {
  position: LatLng | null
  /** Meters of error the receiver admits to. */
  accuracy: number | null
  status: 'idle' | 'waiting' | 'live' | 'denied' | 'unavailable'
}

export function useGeolocation(enabled: boolean): GpsState {
  const [state, setState] = useState<GpsState>({ position: null, accuracy: null, status: 'idle' })
  const filterRef = useRef(createFixFilter())

  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ position: null, accuracy: null, status: 'unavailable' })
      return
    }
    setState((s) => ({ ...s, status: s.position ? 'live' : 'waiting' }))
    filterRef.current.reset()
    const id = navigator.geolocation.watchPosition(
      (fix) => {
        const verdict = filterRef.current.accept({
          position: { lat: fix.coords.latitude, lng: fix.coords.longitude },
          accuracy: fix.coords.accuracy,
          timestamp: fix.timestamp,
        })
        if (!verdict.accepted) return
        setState({
          position: { lat: fix.coords.latitude, lng: fix.coords.longitude },
          accuracy: fix.coords.accuracy,
          status: 'live',
        })
      },
      (error) => {
        setState((s) => ({
          ...s,
          status: error.code === error.PERMISSION_DENIED ? 'denied' : s.position ? 'live' : 'unavailable',
        }))
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [enabled])

  return state
}
