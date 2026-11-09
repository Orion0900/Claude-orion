import type { JingleId } from '../api'
import type { SongDef } from '../song'

/**
 * Jingles: one to three bars each, played once over paused music. Every one
 * is an original figure written for Capsule Critters.
 */
export const JINGLES: Readonly<Record<JingleId, SongDef>> = {
  /** Everyone is rested: a rising chime that settles home. */
  heal: {
    bpm: 150,
    echo: { beats: 0.75, feedback: 0.25, wet: 0.2 },
    voices: { p1: 'bell', p2: 'soft', wave: 'bassSoft' },
    body: {
      p1: `o5 c8 e8 g8 >c8 <b8 g8 >d4 | o6 c2 r2 |`,
      p2: `v10 o4 e2 f4 g4 | o4 e2 r2 |`,
      wave: `o3 c2 g2 | o3 c2 r2 |`,
    },
  },

  /** Found an item. */
  itemGet: {
    bpm: 150,
    voices: { p1: 'brass', p2: 'harm', wave: 'bass' },
    body: {
      p1: `o5 c8 c8 c8 e8 g4 >c4 |`,
      p2: `o4 e8 e8 e8 g8 >c4 e4 |`,
      wave: `o3 c4 c4 c4 c4 |`,
    },
  },

  /** Something important: a fuller fanfare with a drum roll. */
  keyItemGet: {
    bpm: 140,
    voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
    body: {
      p1: `o5 g8. g16 g8 a8 b4 >d4 | o6 c2. r4 |`,
      p2: `o5 d8. d16 d8 e8 g4 b4 | o5 g2. r4 |`,
      wave: `o2 g4 g4 g4 g4 | o3 c2. r4 |`,
      noise: `k8 s16 s16 s8 s8 k4 s4 | c2. r4 |`,
    },
  },

  /** A MEDAL: the proudest fanfare in the game. */
  medalGet: {
    bpm: 150,
    voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
    body: {
      p1: `o5 c8 r8 c8 r8 c8 r8 e4 | o5 g8 r8 g8 r8 g8 r8 >c4 | o6 c2. r4 |`,
      p2: `o4 g8 r8 g8 r8 g8 r8 >c4 | o4 b8 r8 b8 r8 b8 r8 >e4 | o5 e2. r4 |`,
      wave: `o2 c4 c4 c4 c4 | o2 g4 g4 g4 g4 | o3 c2. r4 |`,
      noise: `k8 s8 k8 s8 k8 s8 s8 s8 | k8 s8 k8 s8 k8 s8 s8 s8 | c2. r4 |`,
    },
  },

  /** Level up! */
  levelUp: {
    bpm: 180,
    voices: { p1: 'lead', p2: 'harm', wave: 'bass' },
    body: {
      p1: `o5 c8 e8 g8 >c8 e8 g8 c4 |`,
      p2: `o5 e8 g8 >c8 e8 g8 >c8 e4 |`,
      wave: `o3 c2 c2 |`,
    },
  },

  /** Caught one! */
  caught: {
    bpm: 140,
    voices: { p1: 'lead', p2: 'harm', wave: 'bass' },
    body: {
      p1: `o5 e8 g8 >c8 <g8 e8 g8 >c4 | o6 d8 e8 f8 d8 e2 |`,
      p2: `o5 c8 e8 g8 e8 c8 e8 g4 | o5 b8 >c8 d8 <b8 >c2 |`,
      wave: `o3 c4 g4 c4 g4 | o3 g4 b4 c2 |`,
    },
  },

  /** It evolved. */
  evolved: {
    bpm: 130,
    voices: { p1: 'brass', p2: 'harm', wave: 'bass' },
    body: {
      p1: `o5 g8 b8 >d8 g8 f+8 d8 a4 | o6 g2. r4 |`,
      p2: `o5 d8 g8 b8 >d8 c8 <a8 >d4 | o5 b2. r4 |`,
      wave: `o2 g4 g4 d4 d4 | o2 g2. r4 |`,
    },
  },

  /** The game is saved. */
  save: {
    bpm: 160,
    voices: { p1: 'pluck', p2: 'pluck12' },
    body: {
      p1: `o5 g8 >c8 e8 g4 r8 r4 |`,
      p2: `o5 e8 g8 >c8 e4 r8 r4 |`,
    },
  },

  /** A trainer has spotted you! */
  spotted: {
    bpm: 160,
    voices: { p1: 'lead', p2: 'harm', noise: 'kit' },
    body: {
      p1: `o5 b16 b16 r8 b16 b16 r8 >e4 r4 |`,
      p2: `o5 e16 e16 r8 e16 e16 r8 g+4 r4 |`,
      noise: `s16 s16 r8 s16 s16 r8 c4 r4 |`,
    },
  },

  /** A new ALMANAC entry. */
  almanac: {
    bpm: 140,
    voices: { p1: 'bell', p2: 'pluck12' },
    body: {
      p1: `o6 c8 g8 e8 >c4. r4 |`,
      p2: `o5 e8 >c8 <g8 >e4. r4 |`,
    },
  },
}
