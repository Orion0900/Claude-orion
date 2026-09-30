import type { JingleId } from '../api'
import type { SongDef } from '../song'

/**
 * Jingles: one to two bars each, played once over paused music. They use
 * the same notation as the songs (only a body, which plays once). Every one
 * is an original figure written for Tidebound and lasts 1-4 seconds.
 */
export const JINGLES: Readonly<Record<JingleId, SongDef>> = {
  /** Your beasts are rested: a warm rising chime that settles. */
  heal: {
    bpm: 160,
    echo: { beats: 0.75, feedback: 0.25, wet: 0.2 },
    voices: { p1: 'bell', p2: 'soft', wave: 'bassSoft' },
    body: {
      p1: `o5 e8 g8 >c4 <a8 >c8 <g4 | e8 f8 g8 >e8 c2 |`,
      p2: `v10 o4 g2 a4 g4 | g4 b4 >c2 |`,
      wave: `o3 c2 f4 c4 | e4 g4 c2 |`,
    },
  },

  /** Found an item: a bright little upward flourish. */
  itemGet: {
    bpm: 140,
    voices: { p1: 'brass', p2: 'harm', wave: 'bass' },
    body: {
      p1: `o5 g8 b8 >d8 c8 <b8 >d8 g4 |`,
      p2: `o5 d8 g8 b8 a8 g8 b8 >d4 |`,
      wave: `o2 g4 g4 d4 g4 |`,
    },
  },

  /** An important item: a fuller fanfare with a drum roll. */
  keyItemGet: {
    bpm: 150,
    voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
    body: {
      p1: `o5 d8. d16 f+8. a16 >d4. c+8 | <b8 >c+8 d8 e8 f+2 |`,
      p2: `o4 a8. a16 >d8. f+16 a4. a8 | g8 a8 b8 >c+8 d2 |`,
      wave: `o2 d4. d8 d4. a8 | g4 a4 >d2 |`,
      noise: `c8. s16 s8. s16 k4. s8 | s8 s8 s8 s8 c2 |`,
    },
  },

  /** A Warden's Crest: the proudest few seconds in the game. */
  crestGet: {
    bpm: 128,
    echo: { beats: 0.75, feedback: 0.2, wet: 0.15 },
    voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
    body: {
      p1: `o4 g8. g16 >c8. e16 g4 e8 g8 | a4. b8 >c2 |`,
      p2: `o4 e8. e16 g8. >c16 e4 c8 e8 | f4. f8 e2 |`,
      wave: `o2 c8. c16 c8. c16 c4 c4 | f4. g8 >c2 |`,
      noise: `c8. s16 s8. s16 k4 s4 | s8 s16 s16 s8 s8 c2 |`,
    },
  },

  /** Grew a level: quick and bouncy. */
  levelUp: {
    bpm: 200,
    voices: { p1: 'lead', p2: 'harm', wave: 'bass' },
    body: {
      p1: `o5 f8 a8 >c8 f8 e4 f4 |`,
      p2: `o5 c8 f8 a8 >c8 c4 c4 |`,
      wave: `o2 f4 a4 >c4 <f4 |`,
    },
  },

  /** Caught one: a jaunty skip and a landing. */
  caught: {
    bpm: 150,
    voices: { p1: 'lead', p2: 'harm', wave: 'bass', noise: 'kit' },
    body: {
      p1: `o5 d8 b8 a8 g8 a8 b8 >d4 | c8 <b8 a8 b8 g2 |`,
      p2: `o4 b8 >g8 f+8 e8 f+8 g8 b4 | a8 g8 f+8 g8 d2 |`,
      wave: `o2 g4 e4 c4 d4 | a4 d4 g2 |`,
      noise: `k8 h8 s8 h8 k8 h8 s8 s8 | k8 s8 k8 s8 c2 |`,
    },
  },

  /** It evolved: a broad, bright rise. */
  evolved: {
    bpm: 128,
    echo: { beats: 0.75, feedback: 0.2, wet: 0.15 },
    voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
    body: {
      p1: `o5 e4 g+8. b16 >e4. d+8 | c+8 d+8 e8 f+8 e2 |`,
      p2: `o4 b4 >e8. g+16 b4. b8 | a8 b8 >c+8 d+8 <b2 |`,
      wave: `o2 e4 e4 g+4 b4 | a4 b4 >e2 |`,
      noise: `c4 s8. s16 k4. s8 | s16 s16 s16 s16 s4 c2 |`,
    },
  },

  /** Game saved: a soft confirmation. */
  save: {
    bpm: 180,
    echo: { beats: 0.5, feedback: 0.2, wet: 0.2 },
    voices: { p1: 'bell', p2: 'pluck', wave: 'bassSoft' },
    body: {
      p1: `o5 g8 e8 >c8 <g8 >e4 r4 |`,
      p2: `v9 o5 e8 c8 g8 e8 >c4 r4 |`,
      wave: `o3 c4 <g4 >c4 r4 |`,
    },
  },

  /** A trainer's eyes meet yours: an alarmed sting. */
  trainerSpotted: {
    bpm: 160,
    voices: { p1: 'lead', p2: 'harm', wave: 'bassHard', noise: 'kit' },
    body: {
      p1: `o5 E16 E16 r8 E16 E16 r8 G8 F+8 F8 D+8 | E4 <B4 >E4 r4 |`,
      p2: `o4 B16 B16 r8 B16 B16 r8 >D8 C+8 C8 <A+8 | B4 G4 B4 r4 |`,
      wave: `o3 e16 e16 r8 e16 e16 r8 e8 e8 e8 e8 | e4 <b4 >e4 r4 |`,
      noise: `k16 k16 r8 s16 s16 r8 k8 s8 k8 s8 | c4 s4 S4 r4 |`,
    },
  },
}
