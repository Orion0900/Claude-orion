import { useEffect, useState } from 'react'

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * Today, kept current. An installed app can sit in the background for days
 * and come back just as it was left, so the date is read again whenever the
 * app comes back on screen, and at midnight while it's open. The checklist
 * starts over on the 1st and the 15th, and the card on the 1st, without
 * reopening the app, and a tick or a balance is filed under the right day.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      const now = new Date()
      setToday((d) => (sameDay(d, now) ? d : now))
      clearTimeout(timer)
      // A second into tomorrow, so the new day has surely begun.
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      timer = setTimeout(check, tomorrow.getTime() - now.getTime())
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') check()
    }
    check()
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('pageshow', check)
    window.addEventListener('focus', check)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('pageshow', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  return today
}
