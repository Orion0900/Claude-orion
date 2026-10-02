import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Sex } from '../face/types'

export interface Settings {
  /** Whose ideal ranges to compare against. */
  sex: Sex
  onboarded: boolean
  /** Show the information-only clinical options alongside styling advice. */
  showClinical: boolean
  /** Show approximate millimetres, scaled from the iris. */
  showMm: boolean
}

const KEY = 'facet.settings'
const DEFAULTS: Settings = { sex: 'female', onboarded: false, showClinical: true, showMm: true }

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

type Ctx = [Settings, (patch: Partial<Settings>) => void]
const SettingsContext = createContext<Ctx>([DEFAULTS, () => {}])

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(load)
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Private mode: settings last the session.
      }
      return next
    })
  }, [])
  const value = useMemo<Ctx>(() => [settings, update], [settings, update])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)
