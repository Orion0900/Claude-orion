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
  town: field.town,
  city: field.city,
  route: field.route,
  routeSea: field.routeSea,
  cave: field.cave,
  lab: field.lab,
  haven: field.haven,
  hall: field.hall,
  wreck: field.wreck,
  surf: field.surf,
  beacon: field.beacon,
  rival: field.rival,
  villain: field.villain,
  battleWild: battle.battleWild,
  battleTrainer: battle.battleTrainer,
  battleWarden: battle.battleWarden,
  battleRival: battle.battleRival,
  battleVillain: battle.battleVillain,
  battleLegend: battle.battleLegend,
  battleChampion: battle.battleChampion,
  victoryWild: battle.victoryWild,
  victoryTrainer: battle.victoryTrainer,
  victoryWarden: battle.victoryWarden,
  evolution: battle.evolution,
  credits: battle.credits,
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
