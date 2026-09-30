# Fretfire

A five-fret rhythm game for the iPhone, in the spirit of **Clone Hero**.
Notes race down a 3D highway toward five coloured fret buttons: tap them
as they cross the line, hold the long ones, and fire off star power to
double your multiplier. It plays the song files Clone Hero players already
have (`.chart`, `.mid`, `.sng`, zipped song folders), and it comes with four
original songs so there's something to play the moment it opens.

> Tap two lanes for a chord, hold the tail while the flame roars, clear the
> glowing star phrase, flick ⚡ and watch the multiplier jump to 8×.

It runs in Safari as a web app: no App Store, no account, no server.

## Playing it

Open **https://orion0900.github.io/Claude-orion/fretfire/** on your iPhone.
To install it, tap **Share**, then **Add to Home Screen**; it then launches
full screen, without browser bars, and plays offline. It works upright or
sideways, and on iPads, Android phones and computers too.

| | Tap lanes (default) | Frets + strum | Keyboard | Controller |
|---|---|---|---|---|
| Hit a note | Tap its lane | Hold the fret, tap above the frets to strum | A S D F G or 1–5 | A B Y X LB |
| Chord | Tap every lane in it | Hold every fret, strum | Several keys | Several buttons |
| Sustain | Keep your finger down | Keep the fret held | Keep the key held | Keep it held |
| Strum | — | Tap anywhere above the frets | Enter, Space, ↑ ↓ | D-pad ↑ ↓ |
| Star power | Tap ⚡, or flick the phone | Tap ⚡, or flick the phone | Shift | RB or Back |
| Pause | ❚❚ | ❚❚ | Esc | Start |

**Frets + strum** is the Clone Hero way to play: HOPOs (white-topped gems)
can be hammered on and pulled off without strumming while your streak is
alive, taps (dark-topped gems) can always be fretted, single notes can be
anchored with lower frets held, and extended sustains don't block other
frets. **Tap lanes** turns every gem into a tap target, which suits thumbs.

### Scoring

The rules follow Clone Hero: 50 points a gem, sustains pay while held, the
multiplier climbs every 10 notes to 4×, and star power doubles it. A star
phrase fills a quarter of the meter; half a meter can be deployed and lasts
16 beats. Solos pay a bonus for every note hit and grade the result. A miss
breaks the streak and drops the instrument out of the mix until the next
hit, when the song has a separate instrument track. Results are scored in
stars against a perfect run, and your best per song, part and difficulty is
kept on the phone.

### Sync

Taps on a phone reach the game a little late, and Bluetooth headphones delay
the sound. **Settings → Calibrate sync** plays a click; tap along and
Fretfire measures the delay and corrects for it. The game clock itself comes
from the audio hardware's output timestamp, so notes and sound never drift.

## Your own songs

**Songs → Import** accepts:

- a **.zip** holding one or more song folders (at any depth, zips inside
  zips included);
- a **.sng** file, Clone Hero's single-file song format;
- one song's loose files, picked together: `notes.chart` or `notes.mid`,
  its audio (`song.ogg`, `guitar.ogg`, `bass.ogg`, … or MP3, M4A, WAV,
  Opus, FLAC) and `song.ini`.

Guitar, bass, rhythm, keys and co-op parts play on all four difficulties,
with HOPOs, forced notes, taps, open notes, sustains, star power and solos.
Drum charts are skipped. Songs are kept on the device in IndexedDB, and the
app asks the browser to keep them. Extract `.rar` and `.7z` packs first. If
a song's audio won't decode in your browser (Ogg on older iOS), convert the
audio to MP3 or M4A.

## The built-in songs

*First Light*, *Glass Comet*, *Neon Overdrive* and *Iron Tempest* are
originals written for this game. They're stored as notation, not audio: the
browser arranges drums, bass, rhythm guitar and a lead from chord symbols
and a melody, then synthesises them (plucked-string guitars through amp and
cabinet models, a synthesised kit, room and echo) in a background worker
when you pick a song. The lead part is charted automatically for each
difficulty, with higher notes on higher frets, power chords as two-note
chords and held notes as sustains, and it renders to its own track so it
can drop out when you miss.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle into dist/
npm test         # unit tests
npm run icons    # redraw the PWA icons
```

URL switches for testing: `?play=first-light&diff=expert` starts a song
straight away, `rate=0.75` changes its speed, and `bot` lets the computer
play it perfectly. Browser checks live in [`tests/`](tests/README.md).

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which
builds the game into `/fretfire/` on the GitHub Pages site alongside the
other apps in this repo.

## How it's built

TypeScript, Vite and a 2D canvas; no runtime dependencies.

- `src/chart/` turns every song format into one `Chart`: the tempo map,
  the `.chart`, `.mid` and `song.ini` parsers, and the builder that works
  out chords, HOPOs, sustains, star phrases and solos.
- `src/library/` reads `.zip` and `.sng` files lazily (a big pack never
  sits in memory whole), imports songs and stores them in IndexedDB.
- `src/game/session.ts` is the whole rulebook, judging timestamped input
  with no clock, audio or drawing, so it's tested exhaustively.
  `Game.ts` runs a play: audio clock, input, judging and drawing.
- `src/render/` draws the perspective highway, with gems, flames and HUD
  painted once into sprites and stamped each frame.
- `src/audio/` owns the AudioContext (unlocked on the first tap, set to play
  with the silent switch on), stem playback and miss muting, and effects.
- `src/music/` is the built-in setlist: notation, arranger, synthesiser and
  auto-charter.
- `src/app/` holds the screens, settings, scores and the title's
  self-playing demo.

Fretfire is a fan-made homage. It has its own name, look, sounds and songs,
and isn't affiliated with Clone Hero, Guitar Hero or their makers.
