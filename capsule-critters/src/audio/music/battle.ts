import { accomp } from '../compose'
import type { SongDef } from '../song'

/**
 * Battle music, victory fanfares and the evolution theme. Every melody is an
 * original composition for Capsule Critters.
 */

// ─────────────────────────────────────────────────────────── battleWild ───

const WILD_CHORDS = 'Am F G E Am F Dm E Am F G E F G E E'

/** Something jumps out of the grass: urgent and bouncy. */
export const battleWild: SongDef = {
  bpm: 168,
  voices: { p1: 'lead', p2: 'harm', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `o5 a16 g+16 a16 b16 >c16 <b16 >c16 d16 e16 d16 e16 f16 e16 d16 c16 <b16 | o5 a4 r4 e4 r4 |`,
    p2: `o4 a8 a8 a8 a8 a8 a8 a8 a8 | o4 a4 r4 e4 r4 |`,
    wave: `o2 a8 a8 a8 a8 a8 a8 a8 a8 | o2 a4 r4 e4 r4 |`,
    noise: `s16 s16 s16 s16 s16 s16 s16 s16 s16 s16 s16 s16 s16 s16 s16 s16 | c4 r4 k4 r4 |`,
  },
  body: {
    p1: `
      o5 a8. e16 a8 b8 >c4 <b8 a8 | o5 a4 f8 c8 f4 a4 | o5 g8. d16 g8 a8 b4 a8 g8 | o5 g+2 e4 b4 |
      o5 >c8. <a16 >c8 d8 e4 d8 c8 | o6 c4 <a8 f8 a4 >c4 | o5 d8 e8 f8 a8 >d4 c8 <a8 | o5 b2. g+4 |
      o5 e8 a8 >c8 e8 d8 c8 <b8 a8 | o5 a8 g8 f8 a8 >c4 <a4 | o5 b8 a8 g8 b8 >d4 <b4 | o5 g+8 f+8 e8 g+8 b4 e4 |
      o5 f8 a8 >c8 f8 e8 c8 <a8 f8 | o5 g8 b8 >d8 g8 f8 d8 <b8 g8 | o5 e8 g+8 b8 >e8 d8 <b8 g+8 e8 | o5 b2 >e4 <b4 |`,
    p2: `v9 ${accomp(WILD_CHORDS, '0 1 2 1 0 1 2 1', { center: 64 })}`,
    wave: accomp(WILD_CHORDS, 'R O R O R O R O', { center: 45 }),
    noise: `[k8 h8 s8 h8 k8 k8 s8 h8 |]15 k8 s8 s8 s8 s16 s16 s16 s16 s8 c8 |`,
  },
}

// ──────────────────────────────────────────────────────── battleTrainer ───

const TRAINER_CHORDS = 'Dm Bb C A Dm Bb Gm A Dm F C Bb Gm A Bb A'

/** Eyes meet: a trainer battle, driving and determined. */
export const battleTrainer: SongDef = {
  bpm: 176,
  voices: { p1: 'lead', p2: 'harm', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `o5 d16 d16 d16 r16 d16 d16 d16 r16 f16 f16 f16 r16 a16 a16 a16 r16 |`,
    p2: `o4 d16 d16 d16 r16 d16 d16 d16 r16 f16 f16 f16 r16 a16 a16 a16 r16 |`,
    wave: `o2 d8 r8 d8 r8 f8 r8 a8 r8 |`,
    noise: `k16 k16 s16 r16 k16 k16 s16 r16 k16 k16 s16 r16 c8 r8 |`,
  },
  body: {
    p1: `
      o5 d4 a4 f8 e8 d8 a8 | o5 b-4. f8 d4 f4 | o5 e8 f8 g8 a8 g4 e4 | o5 c+4 e4 a2 |
      o5 f8 e8 d8 f8 a4 >d4 | o6 d8 c8 <b-8 a8 b-4 f4 | o5 g8 a8 b-8 >d8 c8 <b-8 a8 g8 | o5 a2. r4 |
      o5 a8 a8 >d8 <a8 f8 a8 d8 f8 | o5 a8 a8 >c8 <a8 f8 a8 c8 f8 | o5 g8 g8 >c8 <g8 e8 g8 c8 e8 | o5 f8 f8 b-8 f8 d8 f8 <b-8 >d8 |
      o5 g4 b-4 >d4 c8 <b-8 | o5 a4 >c+4 e4 d8 c+8 | o6 d4 <b-4 f4 d4 | o5 e4 c+4 <a4 >e4 |`,
    p2: `v9 ${accomp(TRAINER_CHORDS, '0 2 1 2 0 2 1 2', { center: 62 })}`,
    wave: accomp(TRAINER_CHORDS, 'R O R O R O R O', { center: 38 }),
    noise: `[k8 s8 k8 s8 k8 k8 s8 s8 |]16`,
  },
}

// ─────────────────────────────────────────────────────────── victories ───

const VWILD_CHORDS = 'G C D G G C D G'

/** A wild critter beaten: a skip in the step. */
export const victoryWild: SongDef = {
  bpm: 140,
  voices: { p1: 'lead', p2: 'pluck', wave: 'bass', noise: 'kit' },
  body: {
    p1: `
      o5 b8 >d8 g4 d8 <b8 g4 | o6 c8 e8 g4 e8 c8 <g4 | o5 a8 b8 >c8 d8 c8 <b8 a4 | o5 g2. r4 |
      o5 d8 g8 b8 >d8 d4 <b4 | o6 e8 d8 c8 <b8 >c4 <g4 | o5 f+8 g8 a8 b8 >c4 <a4 | o5 g2 d4 <b4 |`,
    p2: `v8 ${accomp(VWILD_CHORDS, '0 1 2 1 0 1 2 1', { center: 62 })}`,
    wave: accomp(VWILD_CHORDS, 'R:4 F:4 O:4 F:4', { center: 43 }),
    noise: `[k8 h8 s8 h8 k8 h8 s8 h8 |]8`,
  },
}

const VTRAINER_CHORDS = 'C F G C Am F G C'

/** A trainer beaten: brassy and proud. */
export const victoryTrainer: SongDef = {
  bpm: 132,
  voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
  body: {
    p1: `
      o5 c8 e8 g8 >c8 c4 <g4 | o5 a8 >c8 f4 c8 <a8 f4 | o5 g8 b8 >d8 g8 f4 d4 | o6 e2 c4 <g4 |
      o5 a8 b8 >c8 e8 e4 c4 | o5 a8 >c8 f8 a8 g4 f4 | o6 d8 e8 f8 d8 <b4 g4 | o6 c2. r4 |`,
    p2: `v8 ${accomp(VTRAINER_CHORDS, '0:4 1:4 2:4 1:4', { center: 64 })}`,
    wave: accomp(VTRAINER_CHORDS, 'R:4 O:4 F:4 O:4', { center: 36 }),
    noise: `[k8 h8 s8 h8 k8 h8 s8 h8 |]8`,
  },
}

// ─────────────────────────────────────────────────────────── evolution ───

const EVO_CHORDS = 'Cm Ab Bb G'

/** Something is happening: glittering arpeggios climbing and climbing. */
export const evolution: SongDef = {
  bpm: 120,
  echo: { beats: 0.5, feedback: 0.35, wet: 0.25 },
  voices: { p1: 'pluck12', p2: 'soft', wave: 'bass', noise: 'softkit' },
  body: {
    p1: accomp(EVO_CHORDS, '0 1 2 3 4 5 4 3 2 1 0 1 2 3 4 5', { center: 60, len: '16' }),
    p2: `v9 ${accomp(EVO_CHORDS, '0:1', { center: 55 })}`,
    wave: accomp(EVO_CHORDS, 'R:2 R:2', { center: 36 }),
    noise: `[x8 x8 x8 x8 x8 x8 x8 x8 |]4`,
  },
}
