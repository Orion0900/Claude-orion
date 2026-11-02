import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ChevronIcon } from './Icons'

/** Which sections are folded away, kept per device so the screen opens the way it was left. */
const KEY = 'o-budget.folded'

function read(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const Folds = createContext<{ folded: string[]; toggle: (key: string) => void }>({ folded: [], toggle: () => {} })

export function FoldProvider({ children }: { children: ReactNode }) {
  const [folded, setFolded] = useState(read)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(folded))
    } catch {
      // A browser that won't store it just opens everything next time.
    }
  }, [folded])
  const toggle = (key: string) => setFolded((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]))
  return <Folds.Provider value={{ folded, toggle }}>{children}</Folds.Provider>
}

/** Whether a section is folded, and the way to fold or open it. Tapping its heading does it too. */
export function useFold(key: string) {
  const { folded, toggle } = useContext(Folds)
  const isFolded = folded.includes(key)
  return {
    folded: isFolded,
    fold: isFolded ? ' folded' : '',
    headProps: { onClick: () => toggle(key), className: 'section-head fold-head' },
    button: (label: string) => (
      <button
        type="button"
        className="fold-btn"
        aria-expanded={!isFolded}
        aria-label={`${isFolded ? 'Show' : 'Hide'} ${label}`}
        onClick={(e) => {
          e.stopPropagation()
          toggle(key)
        }}
      >
        <ChevronIcon />
      </button>
    ),
  }
}
