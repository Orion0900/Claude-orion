/**
 * The sound contract. Everything is synthesised with WebAudio in the style
 * of a handheld's sound chip — two pulse leads, a wave bass, a noise drum —
 * and every melody is an original composition. The rest of the game only
 * calls this interface; src/audio/index.ts creates the real one.
 */
import type { SpeciesId } from '../data/dex'
import type { TypeId } from '../data/types'

/** Looping background music. */
export type TrackId =
  | 'title'
  | 'intro'
  | 'home'
  | 'town'
  | 'city'
  | 'route'
  | 'routeSea'
  | 'cave'
  | 'lab'
  | 'haven'
  | 'hall'
  | 'wreck'
  | 'surf'
  | 'beacon'
  | 'rival'
  | 'villain'
  | 'battleWild'
  | 'battleTrainer'
  | 'battleWarden'
  | 'battleRival'
  | 'battleVillain'
  | 'battleLegend'
  | 'battleChampion'
  | 'victoryWild'
  | 'victoryTrainer'
  | 'victoryWarden'
  | 'evolution'
  | 'credits'

/** Short fanfares that pause the music, play once, then let it resume. */
export type JingleId = 'heal' | 'itemGet' | 'keyItemGet' | 'crestGet' | 'levelUp' | 'caught' | 'evolved' | 'save' | 'trainerSpotted'

/** One-shot sound effects. */
export type SfxId =
  | 'cursor'
  | 'select'
  | 'cancel'
  | 'error'
  | 'bump'
  | 'door'
  | 'stairs'
  | 'ledge'
  | 'grass'
  | 'splash'
  | 'encounter'
  | 'exclaim'
  | 'hit'
  | 'hitWeak'
  | 'hitSuper'
  | 'miss'
  | 'faint'
  | 'orbThrow'
  | 'orbOpen'
  | 'orbShake'
  | 'orbClick'
  | 'orbBreak'
  | 'xp'
  | 'statUp'
  | 'statDown'
  | 'heal'
  | 'status'
  | 'run'
  | 'buy'
  | 'textBlip'
  | 'menuOpen'
  | 'dexOpen'
  | 'rodCast'
  | 'bite'

export interface MoveSoundSpec {
  type: TypeId
  category: 'physical' | 'special' | 'status'
}

export interface Audio {
  /** Must be called from a user gesture before anything is heard (browser autoplay rules). */
  unlock(): void
  /** Starts a looping track. Asking for the one already playing does nothing. */
  playMusic(id: TrackId): void
  /** Fades the current track out over `seconds` (default 0.5) and stops it. */
  stopMusic(seconds?: number): void
  readonly currentTrack: TrackId | null
  /** Plays a jingle over silenced music; resolves when it ends, and the music resumes. */
  playJingle(id: JingleId): Promise<void>
  sfx(id: SfxId): void
  /** The sound of a move landing or being cast, shaped by its type and category. */
  moveSound(spec: MoveSoundSpec): void
  /**
   * The beast's own cry, generated from its species so each one is distinct
   * and always the same. `faint` plays it lower and dying away.
   */
  cry(species: SpeciesId, faint?: boolean): Promise<void>
  /** 0–1 volumes; the game stores them in the save. */
  setVolumes(music: number, sfx: number): void
}
