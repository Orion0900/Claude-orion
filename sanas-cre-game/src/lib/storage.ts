/**
 * The career and the hall of fame, kept in this browser. Nothing here
 * throws: private browsing and full disks happen, and the game keeps
 * running from memory when it can't save.
 */
import type { GameState } from '../engine/types'

const SAVE_KEY = 'sanas-cre-game.save'
const HALL_KEY = 'sanas-cre-game.hall'

export interface HallEntry {
  firm: string
  founder: string
  title: string
  netWorth: number
  aum: number
  funds: number
  bestIrr: number | null
  years: number
  difficulty: string
  endedOn: string
  bankrupt: boolean
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = store()?.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as GameState
    return s && s.version === 1 && Array.isArray(s.funds) ? s : null
  } catch {
    return null
  }
}

/** False when the save couldn't be written. */
export function saveGame(s: GameState | null): boolean {
  const st = store()
  if (!st) return false
  try {
    if (s) st.setItem(SAVE_KEY, JSON.stringify(s))
    else st.removeItem(SAVE_KEY)
    return true
  } catch {
    return false
  }
}

export function loadHall(): HallEntry[] {
  try {
    const raw = store()?.getItem(HALL_KEY)
    const list = raw ? (JSON.parse(raw) as HallEntry[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function addToHall(entry: HallEntry): HallEntry[] {
  const list = [...loadHall(), entry].sort((a, b) => b.netWorth - a.netWorth).slice(0, 10)
  try {
    store()?.setItem(HALL_KEY, JSON.stringify(list))
  } catch {
    // The list still shows for this session.
  }
  return list
}
