import { accomp } from '../compose'
import type { SongDef } from '../song'
import { riffs } from './field'

/**
 * Battle music, the victory tunes, evolution and the credits. The battle
 * themes climb in intensity: wild (E minor, 164 bpm), trainer (A minor, 168),
 * Warden (C minor, 172), rival (B minor, 176), the Crew's boss (F minor,
 * swaggering), the legend (D minor, epic, built on the swell motif) and the
 * champion (G minor, 184). Each has an intro that plays once, then a 24-bar
 * loop of three eight-bar phrases.
 *
 * Every melody here is an original composition for Tidebound.
 */

/** Sixteenth-note broken chords, the engine of every battle theme. */
const ARP_WILD = '0 1 2 3 2 1 0 1 2 3 2 1 0 1 2 1'
const ARP_TRAINER = '0 1 2 1 3 1 2 1 0 1 2 1 3 1 2 1'
const ARP_WARDEN = '0 2 1 2 3 2 1 2 0 2 1 2 3 2 1 2'
const ARP_RIVAL = '0 1 2 1 0 1 2 1 3 2 1 2 3 2 1 2'
const ARP_EPIC = '0 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1'

const arp16 = (chords: string, pattern: string, center: number): string => accomp(chords, pattern, { center, len: '16' })

// ------------------------------------------------------------------ wild ---

const WILD_CHORDS = 'Em C D Em Em C D B7 Em C D Em Em C D B7 Am Em Am B C D B/D# B7'
const WILD_BEAT = 'k8 h16 h16 s8 h16 h16 k8 k16 h16 s8 h16 h16 |'
const WILD_FILL = 'k8 h16 h16 s8 h16 h16 k8 s16 s16 s16 s16 S8 |'

export const battleWild: SongDef = {
  bpm: 164,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.12 },
  voices: { p1: 'lead', p2: 'pluck12', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `l16 o4 e g a+ o5 c+ e g a+ o6 c+ o5 a+ g e c+ o4 a+ g e c+ |
      o4 f g+ b o5 d f g+ b o6 d o5 b g+ f d o4 b g+ f d |
      l8 o5 E r r16 E16 r8 E r D D+ | E r r16 E16 r8 G F+ F D+ |`,
    p2: `@harm l16 o3 e g a+ o4 c+ e g a+ o5 c+ o4 a+ g e c+ o3 a+ g e c+ |
      o3 f g+ b o4 d f g+ b o5 d o4 b g+ f d o3 b g+ f d |
      @pluck12 v10 ${arp16('Em Em', ARP_WILD, 57)}`,
    wave: `o2 e1 | f1 | e8 r8 r16 e16 r8 e8 r8 d8 d+8 | e8 r8 r16 e16 r8 g8 f+8 f8 d+8 |`,
    noise: `c4 r4 r2 | l16 v8 s s s s v10 s s s s v12 s s s s v15 s s s s |
      l8 v12 K r r16 s16 r8 K r s s | K r r16 s16 r8 s s s S |`,
  },
  body: {
    p1: `
      o5 b4. a8 g4 e4 | g4. f+8 e8 d8 e4 | f+4. e8 d4 a4 | b2 r8 b8 >c8 d8 |
      e4. d8 <b4 g4 | a4. g8 e4 c4 | d4 f+4 a4 >d4 | d+2 <b4 f+4 |
      b4. a8 g4 e4 | g4. f+8 e8 d8 e4 | f+4. e8 d4 a4 | b2 r8 b8 >d8 e8 |
      e4. d8 <b4 >d4 | c4. <b8 g4 e4 | f+4 a4 >d4 f+4 | d+2. <b4 |
      a4. >c8 <b4 a4 | g4. b8 a4 g4 | a4. >c8 e4 d4 | d+2 <b2 |
      >c4. <b8 a4 g4 | a4. g8 f+4 d4 | f+4 a4 b4 >d+4 | f+2 d+4 <b4 |`,
    p2: `v10 ${arp16(WILD_CHORDS, ARP_WILD, 57)}`,
    wave: accomp(WILD_CHORDS, 'R O R O R O R O', { center: 41 }),
    noise: `[[${WILD_BEAT}]7 ${WILD_FILL}]3`,
  },
}

// --------------------------------------------------------------- trainer ---

const TRAINER_CHORDS = 'Am F G Em Am F Dm E Am F G C F Dm E E7 Dm Am Dm E F G Am E'
const TRAINER_BEAT = 'k8 h16 h16 s8 h16 h16 k16 k16 h8 s8 h16 h16 |'
const TRAINER_FILL = 'k8 h16 h16 s8 h16 h16 k16 k16 s16 s16 s16 s16 S8 |'

export const battleTrainer: SongDef = {
  bpm: 168,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.12 },
  voices: { p1: 'lead', p2: 'pluck12', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `o5 a8 a8 r16 a16 a8 g8 g8 r16 g16 g8 | f8 f8 r16 f16 f8 e8 e8 e8 e8 | a1 | g+1 |`,
    p2: `@harm o5 c8 c8 r16 c16 c8 <b8 b8 r16 b16 b8 | a8 a8 r16 a16 a8 g+8 g+8 g+8 g+8 |
      @pluck12 v10 ${arp16('Am E', ARP_TRAINER, 57)}`,
    wave: `o2 a8 a8 r16 a16 a8 g8 g8 r16 g16 g8 | f8 f8 r16 f16 f8 e8 e8 e8 e8 |
      a8 a8 >a8 <a8 g8 >g8 <e8 g8 | e8 e8 >e8 <e8 d8 >d8 <e8 g+8 |`,
    noise: `k8 k8 r16 s16 s8 k8 k8 r16 s16 s8 | k8 k8 r16 s16 s8 s16 s16 s16 s16 S8 S8 | ${TRAINER_BEAT} ${TRAINER_FILL}`,
  },
  body: {
    p1: `
      o5 e4. a8 >c4 <b4 | a4. g8 f4 e4 | d4. g8 b4 a4 | g2 e4 r8 e8 |
      a4. >c8 e4 d4 | c4. <a8 f4 a4 | f4. e8 d4 f4 | e2 g+2 |
      a4. g8 a4 >c4 | <a4. g8 f4 c4 | d4. e8 f4 g4 | e2 c4 e4 |
      a4. g8 a4 >c4 | d4. c8 <a4 f4 | g+4. f8 e4 d4 | e2 r4 e8 f8 |
      f4 a4 >d4. c8 | c4 <a4 e4. f8 | f4 a4 >d4 f4 | e2. d4 |
      c4. <a8 f4 a4 | b4. a8 g4 b4 | >c4. <b8 a4 >e4 | d2 <b2 |`,
    p2: `v10 ${arp16(TRAINER_CHORDS, ARP_TRAINER, 57)}`,
    wave: accomp(TRAINER_CHORDS, 'R R O R F R O R', { center: 41 }),
    noise: `[[${TRAINER_BEAT}]7 ${TRAINER_FILL}]3`,
  },
}

// ---------------------------------------------------------------- warden ---

const WARDEN_CHORDS = 'Cm Ab Bb Gm Cm Ab Fm G Cm Ab Bb Eb Ab Fm G G7 Fm Cm Fm G Ab Bb Cm G7'
const WARDEN_BEAT = 'k8 h16 h16 s8 h16 k16 k8 k16 h16 s8 s16 h16 |'
const WARDEN_FILL = 'k8 h16 h16 s8 h16 k16 s16 s16 s16 s16 u16 u16 t16 t16 |'

export const battleWarden: SongDef = {
  bpm: 172,
  echo: { beats: 0.75, feedback: 0.22, wet: 0.14 },
  voices: { p1: 'brass', p2: 'pluck12', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `o5 G4 r8 G8 G4 r8 G8 | A-4 r8 A-8 A-4 B8 >C8 | c1 | <b1 |`,
    p2: `@harm o5 e-4 r8 e-8 e-4 r8 e-8 | f4 r8 f8 f4 d8 e-8 |
      @pluck12 v10 ${arp16('Cm G', ARP_WARDEN, 60)}`,
    wave: `o2 c4 r8 c8 c4 r8 c8 | d-4 r8 d-8 d-4 g8 g8 |
      c8 c8 >c8 <c8 b-8 >c8 <g8 b-8 | g8 g8 >g8 <g8 f8 >f8 <d8 f8 |`,
    noise: `k4 r8 s8 k4 r8 s8 | k4 r8 s8 k4 s16 s16 s16 s16 | ${WARDEN_BEAT} ${WARDEN_FILL}`,
  },
  body: {
    p1: `
      o5 g4. e-8 >c4. <b-8 | a-4. g8 e-4 c4 | d4. e-8 f4 b-4 | g2 f4 d4 |
      e-4. g8 >c4. d8 | e-4. d8 c4 <a-4 | f4. g8 a-4 >c4 | <b2 >d2 |
      c4. <b-8 g4 e-4 | a-4. g8 a-4 >c4 | d4. c8 <b-4 f4 | g2 e-4 g4 |
      a-4. b-8 >c4 e-4 | d4. c8 <a-4 f4 | g4 b4 >d4 f4 | e-2 d2 |
      c4. <a-8 f4 a-4 | g4. e-8 c4 e-4 | f4. a-8 >c4 f4 | d2. <b4 |
      >c4. <b-8 a-4 e-4 | f4. g8 a-4 b-4 | >c4. d8 e-4 g4 | f2 d2 |`,
    p2: `v10 ${arp16(WARDEN_CHORDS, ARP_WARDEN, 60)}`,
    wave: accomp(WARDEN_CHORDS, 'R R O R R R O F', { center: 41 }),
    noise: `[[${WARDEN_BEAT}]7 ${WARDEN_FILL}]3`,
  },
}

// ----------------------------------------------------------------- rival ---

const RIVAL_B_CHORDS = 'Bm G A F# Bm G Em F# Bm G A D G Em F# F#7 Em Bm Em F# G A Bm F#'
const RIVAL_BEAT = 'k8 h16 h16 s8 h16 k16 h16 k16 k8 s8 h16 h16 |'
const RIVAL_FILL = 'k8 h16 h16 s8 h16 k16 s16 s16 k16 k16 s16 s16 S8 |'

/** Skye for real: her cheeky semitone creep, now at full tilt. */
export const battleRival: SongDef = {
  bpm: 176,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.12 },
  voices: { p1: 'lead', p2: 'pluck12', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `o5 f+8 g8 g+8 b8 r8 >d8 r8 <b8 | a+8 b8 >c+8 d8 c+4 <f+4 | b1 | a+1 |`,
    p2: `@harm o5 d8 e8 f8 f+8 r8 b8 r8 f+8 | f+8 g8 a+8 b8 a+4 c+4 |
      @pluck12 v10 ${arp16('Bm F#', ARP_RIVAL, 59)}`,
    wave: `o2 b8 b8 b8 b8 r8 b8 r8 b8 | f+8 f+8 f+8 f+8 f+4 f+4 | ${accomp('Bm F#', 'R O R O R O R O', { center: 41 })}`,
    noise: `k8 k8 s8 k8 r8 S8 r8 k8 | k8 k8 s8 k8 s16 s16 s16 s16 S8 S8 | ${RIVAL_BEAT} ${RIVAL_FILL}`,
  },
  body: {
    p1: `
      o5 f+4. b8 >d4 c+4 | <b4. a8 g4 d4 | e8 f+8 g8 g+8 a4 >c+4 | <a+2 f+2 |
      f+8 g8 g+8 b8 r8 >d8 r8 <b8 | >d8 c+8 c8 <b8 g4 d4 | e8 g8 b8 >e8 d4 c+8 <b8 | a+4. g+8 f+2 |
      f+4. b8 >d4 c+4 | <b4. >d8 g4 f+4 | e4. d8 c+4 <a4 | f+8 g8 g+8 a8 >d4 <a4 |
      b4. a8 g4 b4 | >e4. d8 c+4 <b4 | a+4 >c+4 e4 f+4 | e4 c+4 <a+4 f+4 |
      g4. f+8 e4 b4 | a8 b8 f+8 d8 <b4 >d4 | e8 f+8 g8 a8 b4 >e4 | c+4. <a+8 f+2 |
      g8 g+8 a8 b8 >d4 <b4 | a8 a+8 b8 >c+8 e4 c+4 | d4. c+8 <b4 f+4 | a+2 >c+2 |`,
    p2: `v10 ${arp16(RIVAL_B_CHORDS, ARP_RIVAL, 59)}`,
    wave: accomp(RIVAL_B_CHORDS, 'R O R O R O F O', { center: 41 }),
    noise: `[[${RIVAL_BEAT}]7 ${RIVAL_FILL}]3`,
  },
}

// --------------------------------------------------------------- villain ---

const VILLAIN_B_CHORDS = 'Fm Fm Bbm Fm Db7 C7 Fm C7 Fm Fm Bbm Fm Db7 C7 Fm C7 Bbm Fm Bbm C Db Eb Fm C7'
const F_RIFF: Readonly<Record<string, string>> = {
  Fm: 'o2 f8 f8 a-8 b-8 b8 b-8 a-8 f8 |',
  Bbm: 'o2 b-8 b-8 >d-8 e-8 e8 e-8 d-8 <b-8 |',
  Db7: 'o2 d-8 d-8 f8 a-8 b8 a-8 f8 d-8 |',
  Db: 'o2 d-8 d-8 f8 a-8 >c8 <a-8 f8 d-8 |',
  C7: 'o2 c8 c8 e8 g8 b-8 g8 e8 c8 |',
  C: 'o2 c8 c8 e8 g8 >c8 <g8 e8 c8 |',
  Eb: 'o2 e-8 e-8 g8 b-8 >d-8 <b-8 g8 e-8 |',
}
const BLUES_RUN = 'f8 f8 a-8 b-8 b8 b-8 a-8 f8 | b-8 b-8 >d-8 e-8 e8 e-8 d-8 <b-8 | f8 f8 a-8 b-8 b8 b-8 a-8 f8 | >c4 <b-4 g4 e4 |'

/** Captain Scrag: the Crew's blues riff turned into a brawl. */
export const battleVillain: SongDef = {
  bpm: 168,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.12 },
  voices: { p1: 'lead50', p2: 'stab', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `o4 ${BLUES_RUN}`,
    p2: `@harm o5 ${BLUES_RUN}`,
    wave: `o2 ${BLUES_RUN}`,
    noise: `[k8 h8 s8 h8 k8 k8 s8 h8 |]3 s4 s4 s8 s8 S8 S8 |`,
  },
  body: {
    p1: `
      o5 c4. a-8 b-8~b8 >c4 | <a-8 f8 r8 e-8 f4 c4 | d-4. f8 b-4 a-4 | f4. e-8 c4 <a-4 |
      >d-8 f8 a-8 b8 >c8 <b-8 a-8 f8 | e4. d-8 c4 <b-4 | >c8 f8 a-8 >c8 <b8 a-8 f8 e-8 | e2 g4 b-4 |
      >c4. <a-8 b-8~b8 >c4 | e-8 c8 r8 <a-8 >c4 f4 | e-4. d-8 <b-4 f4 | a-4. g8 f4 c4 |
      f8 a-8 b8 >c8 d-4 c4 | <b-4. g8 e4 c4 | f8 a-8 >c8 e-8 f4 e-8 c8 | <b-2 g2 |
      f4. d-8 b-4 a-4 | a-4. g8 f4 c4 | d-4 f4 b-4 >d-4 | c2 <g2 |
      a-4. f8 d-4 f4 | g4. b-8 >e-4 d-4 | c4. <a-8 f4 a-4 | g4 e4 c4 <b-4 |`,
    p2: `v10 ${accomp(VILLAIN_B_CHORDS, 'r 1 r 2 r 1 r 2', { center: 62 })}`,
    wave: riffs(F_RIFF, VILLAIN_B_CHORDS),
    noise: `[k8 h8 s8 h8 k8 k8 p8 h8 |]23 k8 h8 s8 h8 s16 s16 s16 s16 S8 S8 |`,
  },
}

// ---------------------------------------------------------------- legend ---

const LEGEND_CHORDS = 'Dm Bb C Am Dm Bb Gm A Dm Bb C F Gm Bb A A7 Bb C Dm Dm Gm A Bb,C A'
const LEGEND_BEAT = 'k8 h16 h16 s8 h8 k8 t16 t16 s8 u16 u16 |'
const LEGEND_FILL = 'k8 h16 h16 s8 h8 l16 t t t t u u s s l8 |'
const SWELLS = 'a16 b-16 >d8 f2. | e16 f16 a8 >c2. |'

/**
 * Atollus wakes. The swell motif from the title, now in D minor, rises in
 * sequence over a bass that falls step by step, then drives an epic loop.
 */
export const battleLegend: SongDef = {
  bpm: 160,
  echo: { beats: 0.75, feedback: 0.25, wet: 0.15 },
  voices: { p1: 'lead', p2: 'pluck12', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `o4 ${SWELLS} o5 d16 e16 f8 a2. | g16 a16 b-8 >d2. |`,
    p2: `@harm o3 ${SWELLS} o4 d16 e16 f8 a2. | g16 a16 b-8 >d2. |`,
    wave: `o3 d1 | c1 | <b-1 | a1 |`,
    noise: `c4 t8 t8 t4 t4 | t4 t8 t8 t4 u8 u8 | c4 t8 t8 t4 t4 | l16 t t t t u u u u s s s s l8 S S |`,
  },
  body: {
    p1: `
      o5 a4 r8 a16 b-16 >d4 f4 | f4. e8 d4 <b-4 | >c4. <b-8 a4 g4 | a2. r4 |
      f4 r8 f16 g16 a4 >d4 | d4. c8 <b-4 f4 | g4. a8 b-4 >d4 | c+2. <a4 |
      a4 r8 a16 b-16 >d4 f4 | f4. e8 d4 f4 | g4. f8 e4 c4 | <a2. r4 |
      b-4. a8 g4 d4 | f4. g8 a4 b-4 | e4 a4 >c+4 e4 | g2 e2 |
      d4. c8 <b-4 a4 | g4. a8 b-4 >c4 | d2. c8 <b-8 | a2 f2 |
      g4. a8 b-4 >d4 | c+4. <b-8 a4 e4 | f4 d4 g4 e4 | a2 >c+2 |`,
    p2: `v10 ${arp16(LEGEND_CHORDS, ARP_EPIC, 57)}`,
    wave: accomp(LEGEND_CHORDS, 'R R O R R O R O', { center: 41 }),
    noise: `[[${LEGEND_BEAT}]7 ${LEGEND_FILL}]3`,
  },
}

// -------------------------------------------------------------- champion ---

const CHAMP_CHORDS = 'Gm Eb F D Gm Eb Cm D Gm Eb F Bb Eb Cm D D7 Cm Gm Cm D Eb F Gm,Eb D'
const CHAMP_BEAT = 'k16 k16 h16 h16 s8 h16 k16 k8 h16 k16 s16 s16 h8 |'
const CHAMP_FILL = 'k16 k16 h16 h16 s8 h16 k16 l16 s s s s u u t t l8 |'

/** Champion Nerissa at the top of the lighthouse: the last and fastest fight. */
export const battleChampion: SongDef = {
  bpm: 184,
  echo: { beats: 0.75, feedback: 0.22, wet: 0.13 },
  voices: { p1: 'lead', p2: 'pluck12', wave: 'bassHard', noise: 'kit' },
  intro: {
    p1: `l16 o5 g d g a- g d g a- g d g a- b- a- g f+ | g d g b- g d g >c <g d g >d c <b- a- f+ |
      l8 o5 G4 r G A-4 r A- | B-4 r B- >C4 <A F+ |`,
    p2: `@harm l16 o4 g d g a- g d g a- g d g a- b- a- g f+ | g d g b- g d g >c <g d g >d c <b- a- f+ |
      l8 o5 D4 r D E-4 r E- | F4 r F G4 E- D |`,
    wave: `o2 [g8]8 | g8 g8 g8 g8 g8 g8 d8 d8 | g4 r8 g8 a-4 r8 a-8 | b-4 r8 b-8 >c4 <d8 d8 |`,
    noise: `l16 k k s k k k s k k k s k s s s s | k k s k k k s k k k s k s s S S |
      l8 C4 r K K4 r K | K4 r K S4 S S |`,
  },
  body: {
    p1: `
      o5 d4. g8 b-4 a4 | g4. f8 e-4 b-4 | a4. >c8 f4 e-4 | d2 <a4 f+4 |
      g4. a8 b-4 >d4 | e-4. d8 c4 <b-4 | >c4. <b-8 g4 e-4 | f+2 a2 |
      b-4. a8 g4 d4 | e-4. f8 g4 b-4 | a4. g8 f4 >c4 | d2. f4 |
      e-4. d8 c4 <b-4 | >c4. <b-8 a4 g4 | f+4 a4 >d4 f+4 | e-2 d4 c4 |
      e-4. d8 c4 <g4 | b-4. a8 g4 d4 | e-4 g4 >c4 e-4 | d2 f+2 |
      g4. f8 e-4 d4 | c4. d8 e-4 f4 | d4 <b-4 >e-4 <g4 | a2 f+2 |`,
    p2: `v10 ${arp16(CHAMP_CHORDS, ARP_EPIC, 60)}`,
    wave: accomp(CHAMP_CHORDS, 'R O R O R O R O', { center: 41 }),
    noise: `[[${CHAMP_BEAT}]7 ${CHAMP_FILL}]3`,
  },
}

// -------------------------------------------------------------- victory ---

const WILD_WIN = 'C Am F G C Am Dm7 G7'

/** A quick fanfare, then a gentle tail that loops while the spoils are counted. */
export const victoryWild: SongDef = {
  bpm: 128,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.15 },
  voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
  intro: {
    p1: `o5 g8 g16 g16 g8 >c8 e4 d8 c8 | d4. <b8 >c2 |`,
    p2: `o5 e8 e16 e16 e8 g8 >c4 <b8 a8 | b4. g8 e2 |`,
    wave: `o2 c8 c16 c16 c8 e8 g4 g8 g8 | g4. g8 >c2 |`,
    noise: `c8 s16 s16 s8 s8 k4 s8 s8 | k4. s8 c2 |`,
  },
  body: {
    p1: `@lead50 v10 o5 e4. d8 c4 e4 | a4. g8 e4 c4 | f4. e8 f4 a4 | g2. r4 |
      e4. d8 c4 g4 | a4. b8 >c4 <a4 | f4 e4 d4 f4 | d2 <b4 r4 |`,
    p2: `@pluck v8 ${accomp(WILD_WIN, '0 1 2 1 3 1 2 1', { center: 60 })}`,
    wave: `@bassSoft ${accomp(WILD_WIN, 'R:4 F:4 O:4 F:4', { center: 43 })}`,
    noise: `@softkit [k8 x8 x8 x8 s8 x8 x8 x8 |]8`,
  },
}

const TRAINER_WIN = 'F Dm Bb C F Dm Gm7 C7'

export const victoryTrainer: SongDef = {
  bpm: 132,
  echo: { beats: 0.75, feedback: 0.2, wet: 0.15 },
  voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
  intro: {
    p1: `o5 f8. f16 a8. a16 >c4 <a4 | b-8. b-16 g8. e16 f2 | a8. a16 >c8. c16 f4 e4 | d4 <b-4 >c2 |`,
    p2: `o5 c8. c16 f8. f16 a4 f4 | g8. g16 e8. c16 c2 | f8. f16 a8. a16 >c4 c4 | <b-4 g4 a2 |`,
    wave: `o2 f8. f16 f8. f16 f4 f4 | c8. c16 c8. c16 f2 | f8. f16 f8. f16 a4 a4 | b-4 >c4 <f2 |`,
    noise: `k8. s16 k8. s16 s4 k4 | k8. s16 k8. s16 c2 | k8. s16 k8. s16 s4 k4 | s4 s4 c2 |`,
  },
  body: {
    p1: `@lead50 v10 o5 c4 f8 g8 a4 f4 | d4 f8 a8 >d4 <a4 | b-4 a8 g8 f4 d4 | e2 c4 r4 |
      c4 f8 g8 a4 >c4 | d4 c8 <a8 f4 a4 | b-4 a8 g8 f4 g4 | e2 g4 r4 |`,
    p2: `@pluck v8 ${accomp(TRAINER_WIN, '0 2 1 2 3 2 1 2', { center: 60 })}`,
    wave: `@bassSoft ${accomp(TRAINER_WIN, 'R:4. F O:4 F:4', { center: 43 })}`,
    noise: `@softkit [k8 x8 s8 x8 k8 x8 s8 x8 |]8`,
  },
}

const WARDEN_WIN = 'Eb Cm Ab Bb Eb Gm Ab,Bb Eb'

export const victoryWarden: SongDef = {
  bpm: 132,
  echo: { beats: 0.75, feedback: 0.25, wet: 0.16 },
  voices: { p1: 'brass', p2: 'harm', wave: 'bass', noise: 'kit' },
  intro: {
    p1: `o5 e-8 e-16 e-16 e-8 g8 b-4. g8 | a-4 >c4 e-4. d8 | d8 d16 d16 d8 c8 <b-4. a-8 | g2 >e-2 |`,
    p2: `o4 b-8 b-16 b-16 b-8 >e-8 g4. e-8 | e-4 a-4 >c4. <b-8 | b-8 b-16 b-16 b-8 a-8 f4. d8 | e-2 g2 |`,
    wave: `o2 e-8 e-16 e-16 e-8 e-8 e-4. e-8 | a-4 a-4 a-4. a-8 | b-8 b-16 b-16 b-8 b-8 b-4. b-8 | e-2 >e-2 |`,
    noise: `c8 s16 s16 s8 k8 k4. s8 | k4 s4 k4. s8 | k8 s16 s16 s8 k8 k4. s8 | s16 s16 s16 s16 s4 c2 |`,
  },
  body: {
    p1: `@lead50 v10 o5 g4 f8 e-8 b-4 g4 | >c4 <b-8 g8 e-4 g4 | a-4 g8 f8 e-4 c4 | d2 f4 r4 |
      g4 a-8 b-8 >e-4 <b-4 | >d4 c8 <b-8 g4 f4 | e-4 c4 d4 f4 | e-2 r2 |`,
    p2: `@pluck v8 ${accomp(WARDEN_WIN, '0 1 2 3 2 1 2 1', { center: 58 })}`,
    wave: `@bassSoft ${accomp(WARDEN_WIN, 'R:4 F:4 O:4 F:4', { center: 43 })}`,
    noise: `@softkit [k8 x8 s8 x8 k8 k8 s8 x8 |]8`,
  },
}

// ------------------------------------------------------------- evolution ---

const EVO_CHORDS = 'Am Bb/A Am Bb/A F G Am E'

/** Something is happening: a shimmering ostinato over a pedal, climbing slowly. */
export const evolution: SongDef = {
  bpm: 120,
  echo: { beats: 0.75, feedback: 0.3, wet: 0.2 },
  voices: { p1: 'lead', p2: 'pluck12', wave: 'bass', noise: 'kit' },
  body: {
    p1: `v10 o5 e1 | f1 | e2 a2 | b-2 f2 | a2. >c4 | <b2. >d4 | c2 e2 | <b2 g+2 |`,
    p2: `v9 ${arp16(EVO_CHORDS, ARP_EPIC, 60)}`,
    wave: accomp(EVO_CHORDS, 'R:2 R:2', { center: 45 }),
    noise: `[r4 x4 r4 x4 |]4 [k4 x8 x8 s4 x8 x8 |]3 l16 s s s s s s s s s s s s l8 S S |`,
  },
}

// --------------------------------------------------------------- credits ---

const CREDITS_CHORDS = 'D A/C# Bm A G D/F# Em7 A7 D Bm G A D Bm Em A G A F#m Bm Em A Dmaj7 D'

/** The end: a look back, the title's swell once more, and home. */
export const credits: SongDef = {
  bpm: 108,
  echo: { beats: 0.75, feedback: 0.3, wet: 0.2 },
  voices: { p1: 'lead', p2: 'pluck', wave: 'bassSoft', noise: 'softkit' },
  intro: {
    p1: `r1 | r1 | o4 r8 a16 b16 >d8 f+8^2 | e2. r4 |`,
    p2: `v8 ${accomp('G A D A', '0 1 2 3 4 3 2 1', { center: 57 })}`,
    wave: accomp('G A D A', 'R:2 F:2', { center: 43 }),
    noise: `r1 | r2 x8 x8 x8 x8 | [k8 x8 s8 x8 k8 x8 s8 x8 |]2`,
  },
  body: {
    p1: `
      o5 f+4. e8 d4 a4 | g4. f+8 e4 c+4 | d4. c+8 <b4 >f+4 | e2. r4 |
      d4. e8 g4 b4 | a4. f+8 d4 f+4 | g4 f+4 e4 d4 | e2 c+2 |
      o4 r8 a16 b16 >d8 f+8^4 e8 d8 | e8 f+8 d4 <b4 r8 b16 >c+16 | d8 e8 g4. f+8 e8 d8 | e2. r8 <a16 b16 |
      >d8 f+8^4 a4 f+8 d8 | b4. a8 f+4 d4 | e8 f+8 g8 a8 b8 a8 g8 e8 | f+4. e8 e2 |
      b4. a8 g4 d4 | c+4. d8 e4 a4 | a4. g8 f+4 c+4 | d2 f+2 |
      g4. f+8 e4 b4 | a4. g8 e4 c+4 | d4 f+4 a4 >c+4 | d1 |`,
    p2: `v8 ${accomp(CREDITS_CHORDS, '0 1 2 3 4 3 2 1', { center: 57 })}`,
    wave: accomp(CREDITS_CHORDS, 'R:4. F O:4 F:4', { center: 43 }),
    noise: `[[k8 x8 s8 x8 k8 x8 s8 x8 |]7 k8 x8 s8 x8 k8 s16 s16 s8 s8 |]3`,
  },
}
