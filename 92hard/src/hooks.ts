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

/** True when running from the Home Screen rather than in a browser tab. */
export function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
}
