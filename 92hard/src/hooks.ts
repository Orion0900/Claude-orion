import { useEffect, useState } from 'react'
import { dateKey, msUntilMidnight, type DateKey } from './lib/dates'

/** Today's date, kept current across midnight and across the app being put away and brought back. */
export function useToday(): DateKey {
  const [today, setToday] = useState(() => dateKey(new Date()))

  useEffect(() => {
    let timer = 0
    const refresh = () => {
      setToday(dateKey(new Date()))
      clearTimeout(timer)
      timer = window.setTimeout(refresh, msUntilMidnight(new Date()) + 500)
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('focus', onShow)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('focus', onShow)
    }
  }, [])

  return today
}

/** Minutes since local midnight. */
function minutesNow(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

/** The time now, to the minute, for the routine's "now" and "next". */
export function useMinutes(): number {
  const [minutes, setMinutes] = useState(minutesNow)

  useEffect(() => {
    const refresh = () => setMinutes(minutesNow())
    const timer = window.setInterval(refresh, 20_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return minutes
}

/** True when running from the Home Screen rather than in a browser tab. */
export function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
}
