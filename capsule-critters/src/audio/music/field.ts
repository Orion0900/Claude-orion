import { accomp } from '../compose'
import type { SongDef } from '../song'

/**
 * Music for the overworld. Every melody here is an original composition for
 * Capsule Critters, written bar by bar in the notation described in
 * notation.ts; harmony and bass mostly come from chord charts via `accomp`.
 */

const BEAT = 'k8 h8 s8 h8 k8 k8 s8 h8 |'
const BEAT_OPEN = 'k8 h8 s8 h8 k8 h8 s8 o8 |'
const SOFT = 'k8 x8 s8 x8 k8 x8 s8 x8 |'

// ──────────────────────────────────────────────────────────────── title ───

const TITLE_CHORDS = 'D G A D Bm G Em A D G A Bm G A D D'

/** Bright and bold: the coin is tossed, the journey starts. */
export const title: SongDef = {
  bpm: 136,
  echo: { beats: 0.75, feedback: 0.28, wet: 0.2 },
  voices: { p1: 'lead', p2: 'pluck', wave: 'bass', noise: 'kit' },
  intro: {
    p1: `o4 a8 b8 >c+8 d8 e8 f+8 g8 a8 | o5 a2. r4 |`,
    p2: `o4 f+8 g8 a8 b8 >c+8 d8 e8 f+8 | o5 e2. r4 |`,
    wave: `o2 a2 a2 | a2. r4 |`,
    noise: `k8 h8 h8 h8 k8 h8 h8 h8 | u8 u8 t8 t8 s8 s8 c4 |`,
  },
  body: {
    p1: `
      o5 d8 f+8 a4 a8 b8 a8 f+8 | o5 g4 b4 b8 a8 g8 b8 | o5 a4. e8 c+8 e8 a8 b8 | o5 a2 f+4 d4 |
      o5 f+8 d8 f+8 b8 b4 a8 f+8 | o5 g4 d4 g8 a8 b4 | o5 e8 g8 b8 >e8 d8 <b8 g8 e8 | o5 a2. r4 |
      o5 d8 f+8 a4 >d4 c+8 <b8 | o5 b4. a8 g4 b4 | o5 a8 g8 f+8 e8 c+4 e4 | o5 f+2 d4 f+4 |
      o5 g8 a8 b8 >d8 d4 <b4 | o5 a8 b8 >c+8 e8 e4 c+4 | o6 d2. <a4 | o5 d2 r2 |`,
    p2: `v10 ${accomp(TITLE_CHORDS, '0 1 2 1 0 1 2 1', { center: 62 })}`,
    wave: accomp(TITLE_CHORDS, 'R:4 R:8 O:8 F:4 R:4', { center: 40 }),
    noise: `[${BEAT}]15 k8 h8 s8 h8 s16 s16 s8 S8 S8 |`,
  },
}

// ──────────────────────────────────────────────────────────────── intro ───

const INTRO_CHORDS = 'F C Dm Bb F C Bb C'

/** The professor's welcome: warm and unhurried. */
export const intro: SongDef = {
  bpm: 104,
  echo: { beats: 1, feedback: 0.25, wet: 0.2 },
  voices: { p1: 'lead50', p2: 'bell', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      o5 c4 a4 g8 f8 a4 | o5 g4. e8 c4 e4 | o5 f4 d4 a8 g8 f8 d8 | o5 f2 d4 r4 |
      o5 a4 >c4 <b-8 a8 g8 a8 | o5 g4 e4 c4 g4 | o5 f8 g8 a8 b-8 a4 g4 | o5 g2. r4 |`,
    p2: `v8 ${accomp(INTRO_CHORDS, '0 2 1 2 0 2 1 2', { center: 60 })}`,
    wave: accomp(INTRO_CHORDS, 'R:4 F:4 O:4 F:4', { center: 41 }),
    noise: `[k4 x8 x8 s4 x8 x8 |]8`,
  },
}

// ───────────────────────────────────────────────────────────────── home ───

const HOME_CHORDS = 'G Em C D G Em Am D G B7 Em C Am D G G'

/** FARTHING TOWN: a little village tune, like a whistle on the way home. */
export const home: SongDef = {
  bpm: 100,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.15 },
  voices: { p1: 'lead50', p2: 'pluck', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      o5 d4 b8 g8 a4 b4 | o5 g4 e8 d8 e2 | o5 c8 d8 e8 g8 g4 e4 | o5 d2. r4 |
      o5 b4 >d8 <b8 a4 g4 | o5 g8 a8 b8 g8 e4 d4 | o5 c4 e4 a8 g8 e8 c8 | o5 d2 f+4 a4 |
      o5 g4. b8 d4 g4 | o5 f+4 d+8 f+8 a4 b4 | o5 g4 e4 b4. g8 | o5 e2 c4 e4 |
      o5 a8 b8 >c8 <a8 e4 a4 | o5 f+8 e8 d8 e8 f+4 a4 | o5 g2 b4 a8 f+8 | o5 g2. r4 |`,
    p2: `v8 ${accomp(HOME_CHORDS, '0 2 1 2 0 2 1 2', { center: 62 })}`,
    wave: accomp(HOME_CHORDS, 'R:4. F:8 O:4 F:4', { center: 43 }),
    noise: `[${SOFT}]16`,
  },
}

// ────────────────────────────────────────────────────────────────── lab ───

const LAB_CHORDS = 'C Am F G C Am Dm7 G'

/** The professor's lab: busy and curious, gadgets whirring. */
export const lab: SongDef = {
  bpm: 120,
  voices: { p1: 'lead', p2: 'chord', wave: 'bass', noise: 'kit' },
  body: {
    p1: `
      o5 e8 g8 >c8 <g8 e8 g8 c8 e8 | o5 a4 e4 c4 e4 | o5 f8 a8 >c8 <a8 f8 a8 >c8 f8 | o5 g2 d4 g4 |
      o5 e8 f8 g8 e8 c4 g4 | o5 a8 b8 >c8 <a8 e2 | o5 d8 f8 a8 >c8 <a4 f4 | o5 g8 f8 e8 d8 b2 |`,
    p2: `v8 ${accomp(LAB_CHORDS, '0:4 1:4 2:4 1:4', { center: 60 })}`,
    wave: accomp(LAB_CHORDS, 'R O R O F R O F', { center: 40 }),
    noise: `[k8 h8 s8 h8 k8 h8 s8 h8 |]8`,
  },
}

// ─────────────────────────────────────────────────────────────── route1 ───

const ROUTE1_CHORDS = 'A E F#m D A E D E A C#m D E F#m D E A'

/** The open road: quick, bright and ready for anything in the grass. */
export const route1: SongDef = {
  bpm: 150,
  echo: { beats: 0.5, feedback: 0.2, wet: 0.15 },
  voices: { p1: 'lead', p2: 'pluck', wave: 'bass', noise: 'kit' },
  body: {
    p1: `
      o5 e8 a8 >c+8 <a8 e4 c+8 e8 | o5 b4 g+8 e8 b4 >e4 | o5 c+4 a8 f+8 c+4 f+8 a8 | o5 a4. f+8 d4 r4 |
      o5 c+8 d8 e8 a8 a4 g+8 a8 | o5 b8 a8 g+8 e8 e2 | o5 f+8 e8 d8 f+8 a4 >d4 | o5 b2. r4 |
      o5 a8 b8 >c+8 e8 e4 c+8 <a8 | o5 g+4 e8 c+8 g+4 b4 | o5 a4 f+8 d8 a4 >d4 | o5 b4. a8 g+4 e4 |
      o5 a8 g+8 f+8 e8 f+4 c+4 | o5 d8 e8 f+8 a8 b4 a4 | o5 g+8 a8 b8 >d8 c+4 <b4 | o5 a2. r4 |`,
    p2: `v9 ${accomp(ROUTE1_CHORDS, '0 1 2 1 0 1 2 1', { center: 61 })}`,
    wave: accomp(ROUTE1_CHORDS, 'R O R O R O F O', { center: 45 }),
    noise: `[${BEAT} ${BEAT_OPEN}]8`,
  },
}

// ───────────────────────────────────────────────────────────────── town ───

const TOWN_CHORDS = 'F Dm Gm C F Dm Bb C'

/** Small towns: easy-going, with a stroll in its step. */
export const town: SongDef = {
  bpm: 112,
  swing: 0.2,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.15 },
  voices: { p1: 'lead50', p2: 'pluck', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      o5 a4 f8 a8 >c4 <a4 | o5 d4 f8 a8 g4 f4 | o5 g8 a8 b-8 >d8 c4 <b-4 | o5 a4 g4 e4 c4 |
      o5 f8 g8 a8 >c8 f4 c4 | o6 d4 <a4 f8 e8 d4 | o5 d8 f8 b-8 >d8 d4 c4 | o5 b-4 g4 e4 g4 |`,
    p2: `v8 ${accomp(TOWN_CHORDS, '0 2 1 2 0 2 1 2', { center: 60 })}`,
    wave: accomp(TOWN_CHORDS, 'R:4 F:4 O:4 F:4', { center: 41 }),
    noise: `[${SOFT}]8`,
  },
}

// ─────────────────────────────────────────────────────────────── clinic ───

const CLINIC_CHORDS = 'C G/B Am Em F C Dm G'

/** The CLINIC: calm bells while the nurse looks after everyone. */
export const clinic: SongDef = {
  bpm: 92,
  echo: { beats: 1, feedback: 0.3, wet: 0.22 },
  voices: { p1: 'lead50', p2: 'bell', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      o5 e4 g4 >c4 <g4 | o5 d4 g4 b4 g4 | o5 c4 e4 a4 e4 | o5 b2 g2 |
      o5 a4 >c4 f4 c4 | o6 e4 <g4 >c4 <g4 | o5 f4 a4 >d4 c4 | o5 b2. r4 |`,
    p2: `v9 ${accomp(CLINIC_CHORDS, '0:4 1:4 2:4 1:4', { center: 64 })}`,
    wave: accomp(CLINIC_CHORDS, 'R:2 F:2', { center: 40 }),
    noise: `[x4 x4 x4 x4 |]8`,
  },
}

// ──────────────────────────────────────────────────────────────── rival ───

const RIVAL_CHORDS = 'Em C D B7 Em C Am B7'

/** The rival swaggers in. */
export const rival: SongDef = {
  bpm: 150,
  swing: 0.15,
  voices: { p1: 'lead', p2: 'stab', wave: 'bassHard', noise: 'kit' },
  body: {
    p1: `
      o5 e8 e8 g8 e8 b8 a8 g8 e8 | o5 g4 e8 c8 e4 g4 | o5 f+8 f+8 a8 f+8 >d8 c8 <a8 f+8 | o5 d+4 f+4 b4 a4 |
      o5 g8 a8 b8 >e8 d8 <b8 g8 e8 | o5 e4 g8 e8 c4 e4 | o5 a8 b8 >c8 e8 d8 c8 <b8 a8 | o5 b2 d+4 f+4 |`,
    p2: `v9 ${accomp(RIVAL_CHORDS, '0 r 2 r 1 r 2 r', { center: 62 })}`,
    wave: accomp(RIVAL_CHORDS, 'R O R O R O R O', { center: 40 }),
    noise: `[k8 h8 s8 k8 k8 h8 s8 h8 |]8`,
  },
}
