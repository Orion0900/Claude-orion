import type { JingleId, SfxId, TrackId } from './api'

/**
 * Every id in the sound contract as a runtime list, for tests and for any
 * sound-test screen. Built from records so the compiler insists each list
 * is complete.
 */

const TRACKS: Record<TrackId, true> = {
  title: true,
  intro: true,
  home: true,
  town: true,
  city: true,
  route: true,
  routeSea: true,
  cave: true,
  lab: true,
  haven: true,
  hall: true,
  wreck: true,
  surf: true,
  beacon: true,
  rival: true,
  villain: true,
  battleWild: true,
  battleTrainer: true,
  battleWarden: true,
  battleRival: true,
  battleVillain: true,
  battleLegend: true,
  battleChampion: true,
  victoryWild: true,
  victoryTrainer: true,
  victoryWarden: true,
  evolution: true,
  credits: true,
}

const JINGLES: Record<JingleId, true> = {
  heal: true,
  itemGet: true,
  keyItemGet: true,
  crestGet: true,
  levelUp: true,
  caught: true,
  evolved: true,
  save: true,
  trainerSpotted: true,
}

const SFX: Record<SfxId, true> = {
  cursor: true,
  select: true,
  cancel: true,
  error: true,
  bump: true,
  door: true,
  stairs: true,
  ledge: true,
  grass: true,
  splash: true,
  encounter: true,
  exclaim: true,
  hit: true,
  hitWeak: true,
  hitSuper: true,
  miss: true,
  faint: true,
  orbThrow: true,
  orbOpen: true,
  orbShake: true,
  orbClick: true,
  orbBreak: true,
  xp: true,
  statUp: true,
  statDown: true,
  heal: true,
  status: true,
  run: true,
  buy: true,
  textBlip: true,
  menuOpen: true,
  dexOpen: true,
  rodCast: true,
  bite: true,
}

export const TRACK_IDS = Object.keys(TRACKS) as readonly TrackId[]
export const JINGLE_IDS = Object.keys(JINGLES) as readonly JingleId[]
export const SFX_IDS = Object.keys(SFX) as readonly SfxId[]
