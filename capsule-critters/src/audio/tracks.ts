import type { JingleId, TrackId } from './api'
import * as battle from './music/battle'
import * as field from './music/field'
import { JINGLES } from './music/jingles'
import { compileSong, type CompiledSong, type SongDef } from './song'

/**
 * Every track and jingle, and a cache so each is parsed from its notation
 * only the first time it plays.
 */
export const SONGS: Readonly<Record<TrackId, SongDef>> = {
  title: field.title,
  intro: field.intro,
  home: field.home,
  lab: field.lab,
  route1: field.route1,
  route2: field.route1,
  route3: field.route1,
  town: field.town,
  city: field.town,
  clinic: field.clinic,
  arena: field.lab,
  forest: field.home,
  cave: field.lab,
  spooky: field.clinic,
  hideout: field.rival,
  sea: field.route1,
  bike: field.route1,
  rival: field.rival,
  villain: field.rival,
  plateau: field.title,
  battleWild: battle.battleWild,
  battleTrainer: battle.battleTrainer,
  battleArena: battle.battleTrainer,
  battleRival: battle.battleTrainer,
  battleLegend: battle.battleWild,
  battleFinal: battle.battleTrainer,
  victoryWild: battle.victoryWild,
  victoryTrainer: battle.victoryTrainer,
  victoryArena: battle.victoryTrainer,
  evolution: battle.evolution,
  credits: field.title,
}

export { JINGLES }

const songCache = new Map<TrackId, CompiledSong>()
const jingleCache = new Map<JingleId, CompiledSong>()

export function track(id: TrackId): CompiledSong {
  let song = songCache.get(id)
  if (!song) {
    song = compileSong(id, SONGS[id])
    songCache.set(id, song)
  }
  return song
}

export function jingle(id: JingleId): CompiledSong {
  let song = jingleCache.get(id)
  if (!song) {
    song = compileSong(`jingle:${id}`, JINGLES[id])
    jingleCache.set(id, song)
  }
  return song
}
