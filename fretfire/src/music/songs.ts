import type { SectionDef, SongDef } from './types'

/**
 * The built-in setlist. Every melody here is original, written for this game
 * in lead notation (see notation.ts): scale degrees on an eighth- or
 * sixteenth-note grid. Sections that repeat share their parts.
 */

const ARTIST = 'The Fretfire House Band'

// ── First Light ─────────────────────────────────────────────────────────
// A gentle mid-tempo anthem in E minor for learning the ropes.

const flIntro: SectionDef = {
  name: 'Intro',
  bars: 4,
  chords: 'i VI III VII',
  drums: 'sparse',
  bass: 'whole',
  rhythm: 'ring',
  pad: true,
  lead: '8: 1 . 1 . 3 . 5 . | 6 . 5 . 3 . 1 . | 3 . 3 . 5 . 7 . | 2 - - - 1 - 7, -',
  star: [[2, 2]],
}

const flVerse: SectionDef = {
  name: 'Verse 1',
  bars: 8,
  chords: 'i VII VI VII',
  drums: 'rock',
  bass: 'root8',
  rhythm: 'chug8',
  lead:
    '8: 5 - - - 4 . 3 . | 2 - - - 1 . 2 . | 3 - - - 5 . 3 . | 2 - - - - - . . |' +
    ' 5 - - - 4 . 3 . | 2 - - - 3 . 4 . | 5 - - - 6 . 5 . | 4 - 3 - 2 - . .',
  star: [[4, 2]],
}

const flChorus: SectionDef = {
  name: 'Chorus 1',
  bars: 8,
  chords: 'i VI III VII',
  drums: 'ride',
  bass: 'octave',
  rhythm: 'ring',
  lead:
    "8: 1' - - - 7 . 1' . | 3' - - - 2' . 1' . | 7 - 1' - 7 . 5 . | 2' - - - - - . . |" +
    " 1' - - - 7 . 1' . | 3' - - - 4' . 3' . | 2' - 1' - 7 - 5 - | P7, - - - - - . .",
  star: [[4, 2]],
}

const flSolo: SectionDef = {
  name: 'Solo',
  bars: 8,
  chords: 'iv i VII III iv i VI VII',
  drums: 'drive',
  bass: 'root8',
  rhythm: 'chug8',
  solo: true,
  lead:
    "8: 4 5 6 1' - - 6 . | 5 - 3 - 1 - . . | 2 3 4 5 - - 4 . | 3 - - - 5 - 7 - |" +
    " 1' - 7 6 5 - 6 - | 5 4 3 2 1 - - . | 3 5 6 1' 3' - 2' 1' | 2' - - - - - - .",
  star: [[4, 2]],
}

const firstLight: SongDef = {
  id: 'first-light',
  title: 'First Light',
  artist: ARTIST,
  genre: 'Rock',
  year: '2026',
  bpm: 104,
  root: 28,
  scale: 'minor',
  leadRoot: 64,
  intensity: 1,
  drive: 1.1,
  sections: [
    flIntro,
    flVerse,
    flChorus,
    { ...flVerse, name: 'Verse 2', star: [[0, 2]] },
    { ...flChorus, name: 'Chorus 2', star: [[2, 2]] },
    flSolo,
    { ...flChorus, name: 'Chorus 3', star: [[0, 2]] },
    {
      name: 'Outro',
      bars: 4,
      chords: 'i VI III i',
      drums: 'half',
      bass: 'whole',
      rhythm: 'ring',
      pad: true,
      ending: true,
      lead: '8: 1 . 1 . 3 . 5 . | 6 . 5 . 3 . 1 . | 3 . 3 . 5 . 7 . | P1 - - - - - - -',
    },
  ],
}

// ── Neon Overdrive ──────────────────────────────────────────────────────
// Driving A minor rock: a pedal-tone riff, a soaring chorus, a quick solo.

const noRiff =
  "16: 1, . 1, 1, 3, . 1, . 4, . 3, . 1, . 7,, . | 1, . 1, 1, 3, . 1, . 5, . 4, 3, 4, . 3, . |" +
  " 6,, . 6,, 6,, 1, . 6,, . 3, . 1, . 6,, . 5,, . | 7,, . 7,, 7,, 2, . 7,, . 4, . 2, . 5, . 7, ."

const noVerse: SectionDef = {
  name: 'Verse 1',
  bars: 8,
  chords: 'i i VI VII',
  drums: 'drive',
  bass: 'root8',
  rhythm: 'chug8',
  lead:
    noRiff +
    " | 16: 1, . 1, 1, 3, . 1, . 4, . 3, . 1, . 7,, . | 1, . 1, 1, 3, . 1, . 5, . 4, 3, 4, . 3, . |" +
    " 6,, . 6,, 6,, 1, . 6,, . 3, . 1, . 6,, . 5,, . | 7,, 1, 2, 3, 4, 5, 6, 7, 1 2 3 4 5 . . .",
  star: [[4, 2]],
}

const noPre: SectionDef = {
  name: 'Pre-Chorus 1',
  bars: 4,
  chords: 'VI VII VI VII',
  drums: 'build',
  bass: 'root8',
  rhythm: 'ring',
  lead: "8: 6 . 6 . 5 . 6 . | 7 . 7 . 6 . 7 . | 1' . 1' . 7 . 1' . | 2' - - - 3' - 5' -",
}

const noChorus: SectionDef = {
  name: 'Chorus 1',
  bars: 8,
  chords: 'i VI III VII',
  drums: 'ride',
  bass: 'octave',
  rhythm: 'ring',
  lead:
    "8: 1'' - - - 7' - 5' - | 6' - - - 5' - 3' - | 5' - 3' - 5' - 6' - | 7' - - - 16: 5' 6' 7' 1'' 8: 2'' 1'' |" +
    " 8: 1'' - - - 7' - 5' - | 6' - - - 7' - 1'' - | 2'' - 1'' - 7' - 5' - | P7 - - - - - - -",
  star: [[4, 2]],
}

const noSolo: SectionDef = {
  name: 'Solo',
  bars: 8,
  chords: 'i VII VI VII i VII VI V',
  drums: 'drive',
  bass: 'root8',
  rhythm: 'chug8',
  solo: true,
  lead:
    "16: 1' 3' 5' 3' 1' 3' 5' 3' 1' 3' 5' 1'' - - 7' 5' | 7 2' 4' 2' 7 2' 4' 2' 7 2' 4' 7' - - 6' 4' |" +
    " 6 1' 3' 1' 6 1' 3' 1' 6 1' 3' 6' - - 5' 3' | 8: 7' - 6' - 5' - 4' - |" +
    " 16: 5' 4' 3' 2' 1' 7 6 5 8: 1' - - - | 16: 7 1' 2' 3' 4' 3' 2' 1' 8: 7 - 5 - |" +
    " 16: 6 7 1' 2' 3' 4' 5' 6' 7' 1'' 2'' 3'' 8: 2'' 1'' | #7' - - - - - - -",
  star: [[0, 2]],
}

const neonOverdrive: SongDef = {
  id: 'neon-overdrive',
  title: 'Neon Overdrive',
  artist: ARTIST,
  genre: 'Hard Rock',
  year: '2026',
  bpm: 148,
  root: 33,
  scale: 'minor',
  leadRoot: 57,
  intensity: 3,
  drive: 1.6,
  sections: [
    {
      name: 'Intro',
      bars: 2,
      chords: 'i',
      drums: 'none',
      bass: 'none',
      rhythm: 'none',
      fill: false,
      lead:
        "16: 1, . 1, 1, 3, . 1, . 4, . 3, . 1, . 7,, . | 1, . 1, 1, 3, . 1, . 5, . 4, 3, 4, . 3, .",
    },
    { name: 'Intro Riff', bars: 4, chords: 'i i VI VII', drums: 'drive', bass: 'root8', rhythm: 'chug8', lead: noRiff, star: [[2, 2]] },
    noVerse,
    noPre,
    noChorus,
    { ...noVerse, name: 'Verse 2', star: [[0, 2]] },
    { ...noPre, name: 'Pre-Chorus 2', star: [[0, 4]] },
    { ...noChorus, name: 'Chorus 2', star: [[0, 2]] },
    noSolo,
    { ...noChorus, name: 'Chorus 3', star: [[2, 2]] },
    {
      name: 'Outro',
      bars: 4,
      chords: 'i i VI i',
      drums: 'drive',
      bass: 'root8',
      rhythm: 'chug8',
      ending: true,
      lead:
        "16: 1, . 1, 1, 3, . 1, . 4, . 3, . 1, . 7,, . | 1, . 1, 1, 3, . 1, . 5, . 4, 3, 4, . 3, . |" +
        ' 6,, . 6,, 6,, 1, . 6,, . 3, . 1, . 6,, . 5,, . | 8: P1, - - - - - - -',
    },
  ],
}

// ── Glass Comet ─────────────────────────────────────────────────────────
// Bright, syncopated D mixolydian groove rock with a dance-floor kick.

const gcRiff =
  "16: 1 . . 3 . . 5 . 6 . 5 . 3 . 1 . | 7, . . 2 . . 4 . 5 . 4 . 2 . 7, . |" +
  " 4 . . 6 . . 1' . 2' . 1' . 6 . 4 . | 1' . 7 . 5 . 3 . 8: 2 - 1 -"

const gcVerse: SectionDef = {
  name: 'Verse 1',
  bars: 8,
  chords: 'I VII IV I I VII IV V',
  drums: 'rock',
  bass: 'root8',
  rhythm: 'stabs',
  lead:
    "16: 5 . . 5 . . 6 . 5 . . 3 . . 1 . | 4 . . 4 . . 5 . 4 . . 2 . . 7, . |" +
    " 6 . . 6 . . 1' . 6 . . 4 . . 2 . | 8: 3 - - - 2 - 1 - |" +
    " 16: 5 . . 5 . . 6 . 1' . . 6 . . 5 . | 4 . . 4 . . 5 . 7 . . 5 . . 4 . |" +
    " 2 . . 4 . . 6 . 1' . . 2' . . 1' . | 8: 7 - - - 5 - #7 -",
  star: [[4, 2]],
}

const gcChorus: SectionDef = {
  name: 'Chorus 1',
  bars: 8,
  chords: 'IV I V VII',
  drums: 'four',
  bass: 'octave',
  rhythm: 'ring',
  pad: true,
  lead:
    "8: 2' - - - 1' - 6 - | 1' - - - 3 - 5 - | 5 - 6 - 7 - 1' - | 7 - - - - - 5 - |" +
    " 2' - - - 1' - 6 - | 1' - - - 3' - 2' - | 1' - 7 - 6 - 5 - | P7 - - - P4 - - -",
  star: [[4, 2]],
}

const glassComet: SongDef = {
  id: 'glass-comet',
  title: 'Glass Comet',
  artist: ARTIST,
  genre: 'Groove Rock',
  year: '2026',
  bpm: 124,
  root: 38,
  scale: 'mixolydian',
  leadRoot: 62,
  intensity: 2,
  drive: 0.9,
  sections: [
    { name: 'Intro', bars: 4, chords: 'I VII IV I', drums: 'four', bass: 'octave', rhythm: 'stabs', pad: true, lead: gcRiff, star: [[2, 2]] },
    gcVerse,
    gcChorus,
    { ...gcVerse, name: 'Verse 2', star: [[0, 2]] },
    { ...gcChorus, name: 'Chorus 2', star: [[0, 2]] },
    {
      name: 'Bridge',
      bars: 4,
      chords: 'vi IV I V',
      drums: 'half',
      bass: 'whole',
      rhythm: 'ring',
      pad: true,
      lead: "8: 3' - - - - - - - | 2' - - - - - 1' - | 6 - - - 5 - 6 - | 7 - - - - - - -",
      star: [[0, 4]],
    },
    {
      name: 'Solo',
      bars: 8,
      chords: 'I VII IV I',
      drums: 'rock',
      bass: 'octave',
      rhythm: 'stabs',
      solo: true,
      lead:
        "16: 1' 2' 3' . 5' . 3' . 2' 1' . 6 5 . . . | 7 1' 2' . 4' . 2' . 1' 7 . 5 4 . . . |" +
        " 12: 4 6 1' 2' 1' 6 4 6 1' 2' - - | 8: 1' - - - - - . . |" +
        " 16: 5' 4' 3' 2' 3' 2' 1' 7 1' 7 6 5 8: 3 - | 16: 7 . 7 1' 2' . 2' 4' 5' . 4' 2' 8: 1' - |" +
        " 16: 6 1' 2' 4' 6' 4' 2' 1' 6 1' 2' 4' 8: 6' - | 1'' - - - - - - -",
      star: [[4, 2]],
    },
    { ...gcChorus, name: 'Chorus 3', star: [[2, 2]] },
    {
      name: 'Outro',
      bars: 4,
      chords: 'I VII IV I',
      drums: 'four',
      bass: 'octave',
      rhythm: 'stabs',
      pad: true,
      ending: true,
      lead:
        "16: 1 . . 3 . . 5 . 6 . 5 . 3 . 1 . | 7, . . 2 . . 4 . 5 . 4 . 2 . 7, . |" +
        " 4 . . 6 . . 1' . 2' . 1' . 6 . 4 . | 8: P1 - - - - - - -",
    },
  ],
}

// ── Iron Tempest ────────────────────────────────────────────────────────
// Fast E minor metal: galloping riffs, a half-time breakdown, a shred solo.

const itRiff =
  '16: 1 . 1 b2 1 . 5, . 1 . 1 b2 1 . 7, . | 1 . 1 b2 1 . 5, . 3 . 2 . b2 . 1 . |' +
  ' b2 . b2 3 b2 . 6, . b2 . b2 3 b2 . 1 . | 1 . 5, . 7, . 1 . 2 . 3 . 4 . 5 .'

const itVerse: SectionDef = {
  name: 'Verse 1',
  bars: 8,
  chords: 'i i VI VII i i bII i',
  drums: 'gallop',
  bass: 'gallop',
  rhythm: 'gallop',
  lead:
    "8: 1' - 7 - 5 - 7 - | 1' - 2' - 3' - 2' - | 3' - - - 2' - 1' - | 2' - - - 7 - 5 - |" +
    " 1' - 7 - 5 - 7 - | 1' - 2' - 3' - 5' - | 4' - - - 3' - b2' - | 16: 1' 7 6 5 4 3 2 1 8: 1 - - -",
  star: [[4, 2]],
}

const itChorus: SectionDef = {
  name: 'Chorus 1',
  bars: 8,
  chords: 'VI VII i i VI VII v v',
  drums: 'double',
  bass: 'drive16',
  rhythm: 'chug16',
  lead:
    "8: 3' - - - 5' - 6' - | 7' - - - 6' - 5' - | 5' - - - - - - - | 5' - 6' - 7' - 1'' - |" +
    " 3'' - - - 2'' - 1'' - | 2'' - - - 1'' - 7' - | #7' - - - - - 5' - | P5 - - - P5 - P5 -",
  star: [[4, 2]],
}

const ironTempest: SongDef = {
  id: 'iron-tempest',
  title: 'Iron Tempest',
  artist: ARTIST,
  genre: 'Metal',
  year: '2026',
  bpm: 172,
  root: 28,
  scale: 'minor',
  leadRoot: 52,
  intensity: 5,
  drive: 2.2,
  sections: [
    { name: 'Intro', bars: 4, chords: 'i i bII i', drums: 'half', bass: 'whole', rhythm: 'ring', lead: itRiff },
    { name: 'Intro Riff', bars: 4, chords: 'i i bII i', drums: 'gallop', bass: 'gallop', rhythm: 'gallop', lead: itRiff, star: [[0, 2]] },
    itVerse,
    itChorus,
    { ...itVerse, name: 'Verse 2', star: [[0, 2]] },
    { ...itChorus, name: 'Chorus 2', star: [[0, 2]] },
    {
      name: 'Breakdown',
      bars: 4,
      chords: 'i i i bII',
      drums: 'half',
      bass: 'whole',
      rhythm: 'chug8',
      lead: '8: P1, - . P1, . P1, P1, . | P1, - . P1, . Pb2, - . | P1, - . P1, . P1, P1, . | Pb2, - - - P1, - - -',
      star: [[0, 4]],
    },
    {
      name: 'Solo',
      bars: 8,
      chords: 'i VI VII i i VI VII v',
      drums: 'gallop',
      bass: 'gallop',
      rhythm: 'gallop',
      solo: true,
      lead:
        "16: 1' 2' 3' 5' 3' 2' 1' 5 1' 2' 3' 5' 8: 7' 5' | 16: 6 1' 3' 5' 3' 1' 6 3 6 1' 3' 5' 8: 6' 5' |" +
        " 16: 7 2' 4' 6' 4' 2' 7 4 7 2' 4' 6' 8: 7' 6' | 1'' - - - 7' 6' 5' 4' |" +
        " 12: 3' 4' 5' 4' 3' 2' 1' 2' 3' 2' 1' 7 | 1' 2' 3' 2' 1' 7 6 7 1' 7 6 5 |" +
        " 16: 7 1' 2' 3' 4' 5' 6' 7' 1'' 2'' 3'' 4'' 8: 5'' - | 5' - - - - - - -",
      star: [[4, 2]],
    },
    { ...itChorus, name: 'Chorus 3', star: [[2, 2]] },
    {
      name: 'Outro',
      bars: 4,
      chords: 'i i bII i',
      drums: 'gallop',
      bass: 'gallop',
      rhythm: 'gallop',
      ending: true,
      lead:
        '16: 1 . 1 b2 1 . 5, . 1 . 1 b2 1 . 7, . | 1 . 1 b2 1 . 5, . 3 . 2 . b2 . 1 . |' +
        ' b2 . b2 3 b2 . 6, . b2 . b2 3 b2 . 1 . | 8: P1, - - - - - - -',
    },
  ],
}

export const BUILTIN_SONGS: readonly SongDef[] = [firstLight, glassComet, neonOverdrive, ironTempest]
