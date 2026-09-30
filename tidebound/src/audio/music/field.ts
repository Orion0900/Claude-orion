import { accomp } from '../compose'
import type { SongDef } from '../song'

/**
 * Music for the overworld: towns, routes, buildings and the story's cast.
 * Every melody here is an original composition for Tidebound.
 *
 * The title, the credits and the legend's battle share one motif, the
 * "swell": a quick lift from the fifth through the sixth to the tonic and up
 * to a held third (A-B-D-F# in D), like a wave gathering and breaking.
 *
 * Melodies are written out bar by bar; harmony and bass mostly come from the
 * chord charts through `accomp`, which writes ordinary notation.
 */

const WALTZ = 144
const SIX_EIGHT = 144

// ---------------------------------------------------------------- title ---

const TITLE_CHORDS = 'D Bm G A D Bm Em A G A F#m Bm G A Bm,A/C# D'
const ROCK = 'k8 h8 s8 h8 k8 k8 s8 h8 |'
const ROCK_OPEN = 'k8 h8 s8 k8 k8 h8 s8 o8 |'
const ROCK_FILL = 'k8 h8 s8 h8 k8 s16 s16 s8 S8 |'

/** Hopeful and sweeping: the swell motif opens every phrase. */
export const title: SongDef = {
  bpm: 132,
  echo: { beats: 0.75, feedback: 0.3, wet: 0.22 },
  voices: { p1: 'lead', p2: 'pluck', wave: 'bass', noise: 'kit' },
  intro: {
    p1: `v9 o4 b2 >d2 | c+2 e2 | v13 o4 a8. a16 a8 >d8 d4 f+4 | e8. e16 e8 a8 a2 |`,
    p2: `v9 ${accomp('G A', '0 1 2 3 4 3 2 1', { center: 55 })}
      @harm v11 o4 f+8. f+16 f+8 a8 a4 >d4 | o5 c+8. c+16 c+8 e8 e2 |`,
    wave: `o2 g1 | a1 | d4. d8 a4 >d4 | <a4. a8 e4 a4 |`,
    noise: `c2 r2 | r2 s16 s16 s16 s16 s8 s8 | c8. s16 s8 k8 k4 s4 | k8. s16 s8 k8 s8 s16 s16 S8 S8 |`,
  },
  body: {
    p1: `
      o4 r8 a16 b16 >d8 f+8^4 e8 d8 | e8 f+8 d4 <b4 r8 b16 >c+16 | d8 e8 g4. f+8 e8 d8 | e2. r8 <a16 b16 |
      >d8 f+8^4 a4 f+8 d8 | b4. a8 f+4 d4 | e8 f+8 g8 a8 b8 a8 g8 e8 | f+4. e8 e2 |
      g4. f+8 g4 a4 | b4. a8 e2 | a4. f+8 c+4 f+4 | e8 d8 c+8 d8 f+2 |
      r8 g16 a16 b8 >d8^4 c+8 <b8 | >c+4. <b8 a4 e4 | f+4 g4 a4 b4 | >d2. r4 |`,
    p2: `v9 ${accomp(TITLE_CHORDS, '0 1 2 3 4 3 2 1', { center: 55 })}`,
    wave: accomp(TITLE_CHORDS, 'R:4. F O:4 F:4', { center: 43 }),
    noise: `[${ROCK}]7 ${ROCK_FILL} [${ROCK_OPEN}]7 ${ROCK_FILL}`,
  },
}

// ---------------------------------------------------------------- intro ---

const INTRO_CHORDS = 'F Am Bb F Dm Gm C C7 F Am Bb Gm F/C C F F'

/** The professor's welcome: a gentle waltz with music-box bells. */
export const intro: SongDef = {
  bpm: 96,
  meter: [3, 4],
  echo: { beats: 1, feedback: 0.25, wet: 0.2 },
  voices: { p1: 'lead50', p2: 'bell', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      v10 o4 a4. g8 f4 | e4 a4 >c4 | d4. c8 <b-4 | a2. |
      a4. b-8 >c4 | d4 <b-4 g4 | e4. f8 g4 | b-2 r4 |
      a4. g8 f4 | e4 a4 >c4 | d4. e8 f4 | g4. f8 d4 |
      c4. <a8 f4 | g2 e4 | f2. | r2. |`,
    p2: `v8 ${accomp(INTRO_CHORDS, '0 1 2 3 2 1', { center: 60, barTicks: WALTZ })}`,
    wave: accomp(INTRO_CHORDS, 'R:4 F:4 O:4', { center: 41, barTicks: WALTZ }),
    noise: `[k4 x4 x4 | r4 x4 x4 |]8`,
  },
}

// ----------------------------------------------------------------- home ---

const HOME_CHORDS = 'G Em C D G/B C Am7,D7 G'

/** The player's house: a cosy little tune like a music box on a shelf. */
export const home: SongDef = {
  bpm: 104,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.15 },
  voices: { p1: 'lead50', p2: 'pluck', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      v11 o5 d8 <b8 >d8 g8 f+4 d4 | e8 d8 <b8 g8 >e4. d8 | c8 e8 g8 >c8 <b4 a4 | a8 g8 f+8 e8 d4 r4 |
      d8 <b8 >d8 g8 a4 g8 f+8 | e4 c8 e8 g4. e8 | d8 c8 <a8 >c8 f+8 e8 d8 c8 | <b4 g4 g2 |`,
    p2: `v8 ${accomp(HOME_CHORDS, '0 2 1 2 3 2 1 2', { center: 55 })}`,
    wave: accomp(HOME_CHORDS, 'R:4 F:4 O:4 F:4', { center: 43 }),
    noise: `v9 [k4 x8 x8 s4 x8 x8 |]8`,
  },
}

// ----------------------------------------------------------------- town ---

const TOWN_CHORDS = 'F Am7 Bb C F Dm7 Gm7 C7 Bbmaj7 Am7 Gm7 C7sus4,C7 Bb C F F'

/**
 * Villages by the sea: a lazy, syncopated tune over ukulele-style picking
 * (the pattern rings the top string between every other note) and a
 * three-three-two island bass.
 */
export const town: SongDef = {
  bpm: 116,
  swing: 0.15,
  echo: { beats: 0.5, feedback: 0.25, wet: 0.18 },
  voices: { p1: 'lead', p2: 'pluck12', wave: 'bass', noise: 'softkit' },
  body: {
    p1: `
      o4 r8 a8 >c8 f8^8 e8 c8 <a8 | g4 e8 g8^4 r4 | r8 f8 b-8 >d8^8 c8 <b-8 f8 | a4 g8 e8^2 |
      r8 a8 >c8 f8^8 g8 a8 f8 | a4 g8 f8 d4 c4 | r8 d8 f8 b-8^8 a8 g8 f8 | g4 e4 c4 r4 |
      d4. c8 d8 f8 a4 | g4. e8 c4 e4 | f4. d8 <b-4 >d4 | c8 d8 f8 g8^8 e8 c8 <b-8 |
      >d4 c8 <b-8 >d4 f4 | e4 g4 >c4. <b-8 | a4 f8 c8 a4 g8 f8 | f2 r2 |`,
    p2: `v10 ${accomp(TOWN_CHORDS, '0 3 2 3 1 3 2 3', { center: 57 })}`,
    wave: accomp(TOWN_CHORDS, 'R:4. F:4. O:4', { center: 43 }),
    noise: `[k8 x8 g8 x8 k8 x8 w8 g8 |]16`,
  },
}

// ----------------------------------------------------------------- city ---

const CITY_CHORDS = 'Bb Gm Eb F Bb Gm Cm7 F7 Eb F Dm Gm Eb F Bb,Gm Cm7,F7'

/** Sparkwharf: cranes, lights and crowds. Busy staccato over an octave bass. */
export const city: SongDef = {
  bpm: 128,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.12 },
  voices: { p1: 'lead12', p2: 'stab', wave: 'bassHard', noise: 'kit' },
  body: {
    p1: `
      o5 d8 f8 r8 d8 f8 b-8 r8 a8 | b-8 g4 d8 r8 g8 f8 d8 | e-8 g8 r8 e-8 g8 >c8 r8 <b-8 | a4 f4 c4 r4 |
      d8 f8 r8 d8 f8 b-8 r8 >c8 | d8 <b-4 g8 r8 b-8 a8 g8 | e-8 g8 r8 e-8 c4 e-8 g8 | f4. e-8 c4 <a4 |
      r8 >g8 g8 f8 g8 b-8^4 | r8 a8 a8 g8 a8 >c8^4 | d8 c8 <a8 f8 d4 f4 | g8 f8 d8 <b-8 g2 |
      r8 >e-8 g8 b-8 >e-4 d8 c8 | <a4 f4 >c4 <a4 | b-4 a8 g8 f4 d4 | e-8 d8 c8 d8 e-8 f8 g8 a8 |`,
    p2: `v10 ${accomp(CITY_CHORDS, 'r 1 r 2 r 1 r 2', { center: 64 })}`,
    wave: accomp(CITY_CHORDS, 'R O R O F O R O', { center: 41 }),
    noise: `[k16 h16 h8 s8 h8 k16 k16 h8 s8 h16 h16 |]15 k8 s16 s16 s8 s16 s16 s8 S8 S8 S8 |`,
  },
}

// ---------------------------------------------------------------- route ---

const ROUTE_A = 'A E/G# F#m D A E D,E A'
const ROUTE_B = 'D E C#m F#m D E F#m,E D,E'

/** Walking pace and a hook that climbs: the road out of town. */
export const route: SongDef = {
  bpm: 124,
  echo: { beats: 0.75, feedback: 0.25, wet: 0.15 },
  voices: { p1: 'lead', p2: 'soft', wave: 'bass', noise: 'kit' },
  body: {
    p1: `
      o5 e8. c+16 e8 a8^4 g+8 a8 | b4 g+8 e8^4 r4 | f+8. e16 f+8 a8^4 g+8 f+8 | e4 d8 <a8^2 |
      >c+8. <b16 >c+8 e8^4 a8 b8 | >c+4 <b8 g+8^4 e4 | f+8 e8 d8 f+8 e8 d8 <b8 g+8 | a2. r4 |
      o5 d4 f+8 a8^4 f+8 d8 | e4 g+8 b8^4 g+8 e8 | c+4 e8 g+8 >c+4 <b8 g+8 | a4. f+8 c+2 |
      d8 e8 f+8 a8 >d4 c+8 <b8 | b4 a8 g+8 e4 f+8 g+8 | a8 g+8 f+8 e8 g+8 f+8 e8 d8 | c+4 d4 e2 |`,
    p2: `v9 ${accomp(ROUTE_A, '1:2 2:2', { center: 64 })}
      @pluck12 ${accomp(ROUTE_B, '0 1 2 1 3 1 2 1', { center: 57 })}`,
    wave: accomp(`${ROUTE_A} ${ROUTE_B}`, 'R R F R O R F N', { center: 43 }),
    noise: `[[${ROCK}]7 k8 h8 s8 h8 k8 s8 s16 s16 S8 |]2`,
  },
}

// ------------------------------------------------------------- routeSea ---

const SEA_CHORDS = 'Eb Bb/D Cm Ab Eb/G Fm7 Bb7sus4 Bb7 Ab Bb Gm Cm Fm7 Bb Eb,Cm Ab,Bb'

/** The open sea between islands: a rolling six-eight, like a boat on swell. */
export const routeSea: SongDef = {
  bpm: 120,
  meter: [6, 8],
  echo: { beats: 1.5, feedback: 0.3, wet: 0.2 },
  voices: { p1: 'lead', p2: 'pluck', wave: 'bass', noise: 'softkit' },
  body: {
    p1: `
      o5 e-4. g8 f8 e-8 | f4 d8 <b-4. | >c4. e-8 d8 c8 | <a-4. >c4. |
      e-4. g8 a-8 b-8 | >c4 <a-8 f4. | e-4. d8 c8 <b-8 | >d4. r4. |
      c4 e-8 a-4 g8 | f4. d8 e-8 f8 | g4 b-8 >d4 c8 | <b-8 g8 e-8 c4. |
      a-4 g8 f4 e-8 | d4. f4. | g8 f8 e-8 g8 a-8 b-8 | >c4. <b-4. |`,
    p2: `v9 ${accomp(SEA_CHORDS, '0 1 2 3 2 1', { center: 58, barTicks: SIX_EIGHT })}`,
    wave: accomp(SEA_CHORDS, 'R:4 F O:4 F', { center: 43, barTicks: SIX_EIGHT }),
    noise: `[k8 x8 g8 s8 x8 g8 |]16`,
  },
}

// ----------------------------------------------------------------- cave ---

const CAVE_CHORDS = 'Dm C/D Bbmaj7 A7sus4 Dm Gm/D Em7b5 A7 Dm Dm Bbmaj7 Gm Dm/F Gm A7sus4 A7'

/** Glimmer Cave: a few bell notes glinting like larvae in the dark, and long echoes. */
export const cave: SongDef = {
  bpm: 84,
  echo: { beats: 0.75, feedback: 0.45, wet: 0.38 },
  voices: { p1: 'bell', p2: 'soft', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      o5 a4 r8 d8 r2 | r4 e8 g8 r8 e8 r4 | f4 r8 a8 r8 d8 r4 | e2 r2 |
      r8 a8 >d8 r8 c4 <a4 | b-4 r8 g8 r2 | r8 e8 g8 b-8 r8 a8 g4 | c+2 r2 |
      d8 f8 a8 >d8 r2 | r4 c8 <a8 r8 f8 r4 | d8 f8 a8 >c8 r2 | r4 <b-8 g8 r8 d8 r4 |
      a4. g8 f4 e4 | d2 r2 | r8 e8 a8 d8 r2 | c+2 r2 |`,
    p2: `v5 ${accomp(CAVE_CHORDS, '1:1', { center: 62 })}`,
    wave: `v10 ${accomp(CAVE_CHORDS, 'R:2. F:4', { center: 41 })}`,
    noise: `[r2 w8 r8 r4 | r1 | r4 t8 r8 r2 | r1 |]4`,
  },
}

// ------------------------------------------------------------------ lab ---

const LAB_CHORDS = 'G C/G G D7 G C A7 D7 Em Am D G C D G,Em Am,D'

/** Professor Maris's lab: curious, busy, a little absent-minded. */
export const lab: SongDef = {
  bpm: 120,
  echo: { beats: 0.5, feedback: 0.2, wet: 0.12 },
  voices: { p1: 'lead12', p2: 'pluck', wave: 'bass', noise: 'softkit' },
  body: {
    p1: `
      o5 q5 d8 g8 f+8 g8 b8 a8 g8 d8 | e8 g8 f+8 g8 >c4 <g4 | d8 g8 f+8 g8 b8 >d8 c8 <b8 | a4 f+4 c4 r4 |
      <b8 >d8 g8 b8 a8 g8 e8 d8 | c8 e8 g8 >c8 <b8 g8 e8 c8 | c+8 e8 a8 g8 f+8 e8 c+8 <a8 | >d4 f+4 a4 r4 |
      g8. f+16 e8 b8 g4 e4 | a8. g16 e8 >c8 <a4 e4 | f+8 g8 a8 >c8 d4 <a4 | b8 a8 g8 f+8 g4 r4 |
      e8 g8 >c8 <g8 e8 g8 >c8 e8 | d8 c8 <a8 f+8 d8 f+8 a8 >c8 | <b4 g4 g8 f+8 e8 g8 | a8 b8 >c8 <a8 f+4 d4 |`,
    p2: `v9 ${accomp(LAB_CHORDS, 'r 1 r 2 r 1 r 2', { center: 62 })}`,
    wave: accomp(LAB_CHORDS, 'R:4 F:4 O:4 F:4', { center: 43 }),
    noise: `[k8 x8 s8 x8 k8 k8 s8 x8 |]16`,
  },
}

// ---------------------------------------------------------------- haven ---

const HAVEN_CHORDS = 'Eb Cm7 Abmaj7 Bb7 Eb Gm7 Abmaj7 Bb7sus4,Bb7 Abmaj7 Gm7 Fm7 Bb7 Ebmaj7 Cm7 Fm7,Bb7 Eb'

/** The healing house: warm, unhurried, with a little lilt. */
export const haven: SongDef = {
  bpm: 96,
  swing: 0.12,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.15 },
  voices: { p1: 'lead50', p2: 'pluck', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      v11 o5 g4 b-8 g8 e-4 f8 g8 | b-4 g8 e-8 c4 r4 | c4 e-8 g8 >c4 <b-8 a-8 | b-4. a-8 f4 r4 |
      g4 b-8 g8 e-4 f8 g8 | b-4 >d8 <b-8 g4 f4 | e-4 c8 e-8 a-4 g8 f8 | e-4 f4 d4 r4 |
      c4. e-8 g4 a-4 | b-4. a-8 g4 f4 | a-4. g8 f4 e-4 | d4 f4 b-4 a-4 |
      g4. f8 g8 b-8 >d4 | c4 <b-8 g8 e-4 c4 | f4 a-4 g4 f4 | e-2. r4 |`,
    p2: `v8 ${accomp(HAVEN_CHORDS, '0 2 3 2 1 2 3 2', { center: 58 })}`,
    wave: accomp(HAVEN_CHORDS, 'R:4. F O:4 F:4', { center: 41 }),
    noise: `v10 [k4 x4 w4 x4 |]16`,
  },
}

// ----------------------------------------------------------------- hall ---

const HALL_CHORDS = 'Cm Cm Ab Bb Cm Fm G G7 Eb Bb/D Cm Ab Fm G Ab,Bb G'
const MARCH = 'k8 s16 s16 s8 s8 k8 s16 s16 s8 s8 |'
const MARCH_FILL = 'k8 s16 s16 s8 s8 s16 s16 s16 s16 S8 S8 |'

/** A Warden's hall: a proud march with a snare that won't sit still. */
export const hall: SongDef = {
  bpm: 132,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.12 },
  voices: { p1: 'brass', p2: 'stab', wave: 'bassHard', noise: 'kit' },
  body: {
    p1: `
      o4 g8. g16 >c4 d4 e-4 | g4. f8 e-4 d4 | c8. c16 e-4 f4 a-4 | g2 f4 d4 |
      e-8. e-16 g4 >c4 <b-4 | a-4. g8 f4 a-4 | g4 b4 >d4. c8 | <b2 g4 r4 |
      g8. g16 b-4 >e-4 d4 | c4. <b-8 f4 d4 | e-8. e-16 g4 >c4 d4 | e-4. d8 c4 <a-4 |
      f8. f16 a-4 >c4 <a-4 | b4. >c8 d2 | e-4 c4 d4 <b-4 | >d2 <b4 g4 |`,
    p2: `v10 ${accomp(HALL_CHORDS, 'r 1 r 2 r 1 r 2', { center: 62 })}`,
    wave: accomp(HALL_CHORDS, 'R R F R R R O F', { center: 41 }),
    noise: `[[${MARCH}]3 ${MARCH_FILL}]4`,
  },
}

// ---------------------------------------------------------------- wreck ---

const WRECK_CHORDS = 'Em Em/D# Em7/D C#m7b5 Cmaj7 B7 Em B7 Am Em/G F#m7b5 B7 Cmaj7 Am6 B7 Em'

/**
 * The old wreck: a slow lament that sinks a semitone at a time, a lead
 * that slides between notes like timbers groaning, and a music box
 * somewhere below deck.
 */
export const wreck: SongDef = {
  bpm: 84,
  echo: { beats: 1, feedback: 0.4, wet: 0.3 },
  voices: { p1: 'lead12', p2: 'bell', wave: 'bassSoft', noise: 'softkit' },
  body: {
    p1: `
      o5 r4 b4~>c4 <b4 | r8 g8 f+8 d+8 e2 | r4 a4~b-4 a4 | g2 e2 |
      r4 e4 g4 b4 | a+4. b8 f+2 | r8 e8 f+8 g8 a+8 b8 >c4 | <b1 |
      r4 c4 e4 a4 | g4. f+8 e2 | r4 a4~>c4 <a4 | f+2 d+2 |
      r8 b8 a8 g8 e4. d+8 | e2 f+2 | e4 d+4 f+4 a4 | g4~f+4 e2 |`,
    p2: `v7 ${accomp(WRECK_CHORDS, 'r:4 2 1 r:4 3 2', { center: 64 })}`,
    wave: `o3 e1 | d+1 | d1 | c+1 | c1 | <b1 | >e1 | <b1 | a1 | g1 | f+1 | b1 | >c1 | <a1 | b1 | >e1 |`,
    noise: `[r2 t4 r4 | r4 w8 r8 r2 | r1 | r2. t8 t8 |]4`,
  },
}

// ----------------------------------------------------------------- surf ---

const SURF_CHORDS = 'E B/D# C#m A E/G# A B B7 A B G#m C#m A B E,C#m A,B'

/** Surfing: wide leaps and long notes over glittering sixteenths. */
export const surf: SongDef = {
  bpm: 136,
  echo: { beats: 0.75, feedback: 0.3, wet: 0.2 },
  voices: { p1: 'lead', p2: 'pluck12', wave: 'bass', noise: 'kit' },
  body: {
    p1: `
      o5 b2 e4 g+4 | f+2. d+4 | e4. c+8 g+4 >c+4 | <b2 a4 e4 |
      g+2 b4 >e4 | d+4. c+8 <a2 | b4. a8 g+4 f+4 | a2 f+4 d+4 |
      e4 c+8 e8 a2 | f+4 d+8 f+8 b2 | g+4. f+8 d+4 <b4 | >c+2. e4 |
      a4. g+8 a4 >c+4 | <b4. a8 b4 >d+4 | e4 <b4 >c+4 <g+4 | a4 b4 >c+4 d+4 |`,
    p2: `v8 ${accomp(SURF_CHORDS, '0 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1', { center: 60, len: '16' })}`,
    wave: accomp(SURF_CHORDS, 'R:4 R F O:4 R F', { center: 43 }),
    noise: `[[k8 h8 s8 o8 k8 k8 s8 o8 |]7 k8 h8 s8 o8 k8 s16 s16 s8 c8 |]2`,
  },
}

// --------------------------------------------------------------- beacon ---

const BEACON_CHORDS = 'C G/B Am Em/G F C/E Dm7 Gsus4,G F G Em7 Am Dm7 G7 F,G C'

/** Beacon Isle: stately and patient, with an organ in the wave channel. */
export const beacon: SongDef = {
  bpm: 88,
  echo: { beats: 1, feedback: 0.3, wet: 0.2 },
  voices: { p1: 'brass', p2: 'soft', wave: 'organ', noise: 'kit' },
  body: {
    p1: `
      o5 e4. f8 g4 c4 | d4. e8 d4 <b4 | >c4. d8 e4 a4 | g2. r4 |
      a4. g8 f4 c4 | g4. f8 e4 c4 | f4 e4 d4 a4 | g4 f4 d2 |
      a4. g8 a4 >c4 | <b4. a8 g4 d4 | e4. f+8 g4 b4 | >c2. <b8 a8 |
      a4. g8 f4 d4 | g4. f8 d4 <b4 | >c4. d8 e4 f4 | g4 e4 c2 |`,
    p2: `v9 ${accomp(BEACON_CHORDS, '1:2 2:2', { center: 64 })}`,
    wave: accomp(BEACON_CHORDS, 'R:2 F:4 O:4', { center: 43 }),
    noise: `v10 [[k4 x4 s4 x4 |]7 k4 x4 s4 t8 t8 |]2`,
  },
}

// ---------------------------------------------------------------- rival ---

const RIVAL_CHORDS = 'F D7 Gm C7 F D7 G7 C7 Bb Bdim7 F/C D7 Gm7 C7 F,D7 G7,C7'

/** Skye turns up: a cheeky, sidling tune that creeps up by semitones. */
export const rival: SongDef = {
  bpm: 148,
  echo: { beats: 0.5, feedback: 0.15, wet: 0.1 },
  voices: { p1: 'lead', p2: 'pluck', wave: 'bass', noise: 'kit' },
  body: {
    p1: `
      o5 q5 c8 c+8 d8 f8 r8 a8 r8 f8 | f+8 a8 r8 f+8 >c4 <a8 f+8 | g8 f+8 g8 b-8 r8 >d8 r8 <b-8 | >c8 <b8 b-8 a8 g4 e4 |
      c8 c+8 d8 f8 r8 a8 r8 >c8 | d8 c8 <a8 f+8 d4 f+8 a8 | b8 a8 g8 f8 d8 f8 g8 b8 | >c4 <g4 c4 r4 |
      r8 d8 f8 b-8 a8 b-8 >d8 <b-8 | a-8 f8 d8 <b8 >d4 f4 | a8 g8 f8 e8 f8 a8 >c8 <a8 | f+4 a4 >d4 c4 |
      <b-8 a8 g8 f8 g8 b-8 >d8 f8 | e4 c4 <b-4 g4 | a8 g8 f8 a8 f+8 a8 >c8 <a8 | b8 >d8 <b8 g8 e8 g8 b-8 >c8 |`,
    p2: `v10 ${accomp(RIVAL_CHORDS, 'r 1 r 2 r 1 r 2', { center: 62 })}`,
    wave: accomp(RIVAL_CHORDS, 'R:4 F:4 O:4 F:4', { center: 43 }),
    noise: `[k8 h8 s8 h8 k8 h8 s8 k8 |]16`,
  },
}

// -------------------------------------------------------------- villain ---

const VILLAIN_CHORDS = 'Em Em Am Em C7 B7 Em B7'
/** One bar of the crew's walking blues riff per chord. */
const E_RIFF: Readonly<Record<string, string>> = {
  Em: 'o2 e8 e8 g8 a8 b-8 a8 g8 e8 |',
  Am: 'o2 a8 a8 >c8 d8 e-8 d8 c8 <a8 |',
  C7: 'o2 c8 c8 e8 g8 b-8 g8 e8 c8 |',
  B7: 'o2 b8 b8 >d+8 f+8 a8 f+8 d+8 <b8 |',
}
const riffs = (table: Readonly<Record<string, string>>, chords: string): string =>
  chords
    .split(' ')
    .map((c) => table[c])
    .join(' ')

/** The Tidewrack Crew: a swaggering, swung blues with bent notes. */
export const villain: SongDef = {
  bpm: 112,
  swing: 0.3,
  echo: { beats: 0.5, feedback: 0.2, wet: 0.1 },
  voices: { p1: 'lead50', p2: 'stab', wave: 'bassHard', noise: 'kit' },
  body: {
    p1: `
      o4 e8 g8 r8 a8 b-8~b4 r8 | r8 >d8 e8 d8 <b8 a8 g8 e8 | a8 >c8 r8 d8 e-8~e4 r8 | r8 g8 e8 d8 <b4 g4 |
      r8 >c8 e8 g8 b-4 a8 g8 | a4 f+8 d+8 <b4 a4 | g8 a8 b-8~b8 >e4 d8 <b8 | >d+4 f+4 b4 r4 |
      r8 e8 g8 b8 >d8~e4 <b8 | a8 g8 e8 g8 b-4~a4 | r8 e8 a8 >c8 <b8 a8 e8 d8 | e8 g8 r8 e8 d8 <b8 >d8 e8 |
      g8 b-8 r8 g8 e8 c8 e8 g8 | f+8 a8 r8 f+8 d+4 <b4 | >e4 g8 a8 b-8~b4 g8 | f+8 d+8 <b8 a8 f+4 d+4 |`,
    p2: `v12 ${accomp(`${VILLAIN_CHORDS} ${VILLAIN_CHORDS}`, 'r:4 1 r r:4 2 r', { center: 60 })}`,
    wave: `${riffs(E_RIFF, VILLAIN_CHORDS)} ${riffs(E_RIFF, VILLAIN_CHORDS)}`,
    noise: `[k8 h8 p8 h8 k8 k8 s8 h8 |]16`,
  },
}

export { riffs }
