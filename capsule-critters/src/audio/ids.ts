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
  lab: true,
  route1: true,
  route2: true,
  route3: true,
  town: true,
  city: true,
  clinic: true,
  arena: true,
  forest: true,
  cave: true,
  spooky: true,
  hideout: true,
  sea: true,
  bike: true,
  rival: true,
  villain: true,
  plateau: true,
  battleWild: true,
  battleTrainer: true,
  battleArena: true,
  battleRival: true,
  battleLegend: true,
  battleFinal: true,
  victoryWild: true,
  victoryTrainer: true,
  victoryArena: true,
  evolution: true,
  credits: true,
}

const JINGLES: Record<JingleId, true> = {
  heal: true,
  itemGet: true,
  keyItemGet: true,
  medalGet: true,
  levelUp: true,
  caught: true,
  evolved: true,
  save: true,
  spotted: true,
  almanac: true,
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
  capsuleThrow: true,
  capsuleOpen: true,
  capsuleShake: true,
  capsuleClick: true,
  capsuleBreak: true,
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
