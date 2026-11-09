import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The popout: a panel up from the bottom on a phone, a card in the middle
 * on a wider screen. Escape or a tap outside closes it, and focus goes back
 * to whatever opened it.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    // Focus the panel, not a field, so the keyboard stays down until it's wanted.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return (
    <div className="scrim" onClick={() => close.current()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}
