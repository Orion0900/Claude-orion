import { useCallback, useEffect, useState, type ReactNode } from 'react'

export interface ConfirmRequest {
  title: string
  body: string
  /** The button that goes ahead, named for what it does. */
  action: string
  danger?: boolean
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void
}

/**
 * Asks before something that can't be taken back. The browser's own confirm
 * box titles itself with the site's address on an iPhone, so the question is
 * asked in the app instead. Render the element; await `ask`.
 */
export function useConfirm(): [ReactNode, (request: ConfirmRequest) => Promise<boolean>] {
  const [pending, setPending] = useState<Pending | null>(null)
  const ask = useCallback(
    (request: ConfirmRequest) => new Promise<boolean>((resolve) => setPending({ ...request, resolve })),
    [],
  )
  const answer = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok)
      setPending(null)
    },
    [pending],
  )
  return [pending ? <ConfirmSheet request={pending} onAnswer={answer} /> : null, ask]
}

function ConfirmSheet({ request, onAnswer }: { request: ConfirmRequest; onAnswer: (ok: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onAnswer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnswer])

  return (
    <div className="sheet-backdrop confirm-backdrop" onClick={() => onAnswer(false)}>
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-title" id="confirm-title">
          {request.title}
        </h2>
        <p className="confirm-body" id="confirm-body">
          {request.body}
        </p>
        <button className={request.danger ? 'btn danger solid' : 'btn primary'} onClick={() => onAnswer(true)}>
          {request.action}
        </button>
        {/* The safe answer has focus, so Enter never destroys anything. */}
        <button className="btn" autoFocus onClick={() => onAnswer(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
