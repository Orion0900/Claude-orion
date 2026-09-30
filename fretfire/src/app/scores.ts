import type { Difficulty, Instrument } from '../chart/types'
import type { Results } from '../game/session'

/** Best results per song, part and difficulty, kept on the device. */
export interface BestScore {
  score: number
  stars: number
  accuracy: number
  fullCombo: boolean
  date: number
}

const KEY = 'fretfire.scores.v1'

function readAll(): Record<string, BestScore> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, BestScore>
  } catch {
    return {}
  }
}

const keyOf = (songId: string, instrument: Instrument, difficulty: Difficulty) => `${songId}|${instrument}|${difficulty}`

export function getBest(songId: string, instrument: Instrument, difficulty: Difficulty): BestScore | undefined {
  return readAll()[keyOf(songId, instrument, difficulty)]
}

/** The song's best result on any part, for the song list. */
export function bestForSong(songId: string): BestScore | undefined {
  let best: BestScore | undefined
  for (const [key, value] of Object.entries(readAll())) {
    if (key.startsWith(`${songId}|`) && (!best || value.stars > best.stars || (value.stars === best.stars && value.score > best.score))) {
      best = value
    }
  }
  return best
}

/** Records a finished run; returns whether it beat the old best. */
export function recordScore(songId: string, instrument: Instrument, difficulty: Difficulty, results: Results): boolean {
  if (results.failed) return false
  const all = readAll()
  const key = keyOf(songId, instrument, difficulty)
  const old = all[key]
  if (old && old.score >= results.score) {
    // A full combo still counts even when the score doesn't beat the record.
    if (results.fullCombo && !old.fullCombo) {
      old.fullCombo = true
      write(all)
    }
    return false
  }
  all[key] = {
    score: results.score,
    stars: results.stars,
    accuracy: results.accuracy,
    fullCombo: results.fullCombo || !!old?.fullCombo,
    date: Date.now(),
  }
  write(all)
  return true
}

/** Forgets a removed song's records. */
export function forgetScores(songId: string): void {
  const all = readAll()
  for (const key of Object.keys(all)) if (key.startsWith(`${songId}|`)) delete all[key]
  write(all)
}

function write(all: Record<string, BestScore>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Storage full or private mode: the record lasts this visit only.
  }
}
