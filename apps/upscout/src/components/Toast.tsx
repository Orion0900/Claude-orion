import { useEffect } from 'react'

/** A line of feedback that clears itself, kept above the phone's home bar. */
export default function Toast({
  toast,
  onDone,
}: {
  toast: { text: string; tone: 'ok' | 'bad' } | null
  onDone: () => void
}) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDone, 4000)
    return () => clearTimeout(timer)
  }, [toast, onDone])

  if (!toast) return null
  return (
    <div className={`toast toast-${toast.tone}`} role="status" onClick={onDone}>
      {toast.text}
    </div>
  )
}
