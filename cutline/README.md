# Cutline

An AI video editor for talking to camera, in the spirit of the Captions app,
that runs on your iPhone. Import a clip or record one with the teleprompter,
and Cutline writes animated word-by-word captions, cuts your pauses and ums,
punches in on the big moments, and exports a video ready for TikTok, Reels or
Shorts.

Speech recognition runs **on the phone**. Your video never leaves it.

## Installing it on an iPhone

It's a web app that installs like a native one. Once the site is deployed
(see below):

1. Open **https://orion0900.github.io/Claude-orion/cutline/** in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

It gets its own icon and launches full screen. The first transcription
downloads the speech model (about 80 MB for the default size), once; after
that captions work without a signal. iOS only offers Add to Home Screen from
Safari. Exporting uses WebCodecs, which needs iOS 26 or later for the fast
path; older versions fall back to recording the edit in real time.

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which builds
this app into `/cutline/` on the GitHub Pages site next to the others. Merging
is the only step.

## What it does

- **Captions that move with your voice.** Word-level timing from Whisper drives
  ten animated looks — Bold Pop, Karaoke, Highlight Box, Clean, Typewriter,
  Neon, Bounce, Subtitle, Comic and Marker — each adjustable: font, size,
  position, words per caption, lines, all caps, colours and outline.
- **AI Edit in one tap.** Pauses shortened to a natural beat, filler words cut,
  punch-in zooms on emphasis and at jump cuts, keywords coloured and emojis
  added. Every part can be switched off on its own, and undo takes it all back.
- **Edit by text.** The transcript is the timeline: tap a word to jump there,
  select words to cut them, fix a word Whisper misheard, mark a keyword, add an
  emoji or force a new caption.
- **Framing.** 9:16, 4:5, 1:1, 16:9 or original; fill or fit on a blurred
  background; zoom and re-centre on your face.
- **Hook title card** over the opening seconds, and an optional progress bar.
- **Music** from the Files app, looped, with ducking under your voice.
- **Teleprompter recording.** The script scrolls just under the lens at your
  speed; tap it to pause. A take opens straight into a new project.
- **Export** at 1080p or 720p, captions burned in, to the share sheet: Save
  Video puts it in Photos. Captions also export as an `.srt` file.
- **Projects stay on the phone**, with undo and redo, and reopen where you left
  them.

### With Claude (optional)

Add your own Anthropic API key in Settings and five more tools appear in the AI
tab: smarter keyword and emoji picks, hook titles with a post caption and
hashtags, the best 20–60 second clips from a long video, caption translation
into 18 languages, and fixes for names and jargon Whisper got wrong. A
teleprompter script can be written from a one-line brief. Only transcript text
is sent, only when you tap one of these; the key stays on the phone. The model
is Claude Opus 5.5 by default, with Sonnet 5.5 and Haiku 4.5 offered in
Settings.

## How it works

### Transcription on the phone

The audio is decoded with WebCodecs, mixed to 16 kHz mono and fed to OpenAI's
Whisper running in a Web Worker on ONNX Runtime's WebAssembly build, through
transformers.js. Word-level timestamps come from the model's cross-attention
(dynamic time warping over the alignment heads); transformers.js stamps each
word one token late, so the times are shifted back, and word edges are then
trimmed against the loudness so pauses aren't swallowed into the words around
them. Long recordings are split at the quietest moment near each 28-second
mark, so no word is cut in half and progress can be shown per chunk.

Whisper invents words over silence and noise — "you", "Thank you for
watching!" — so windows with no speech in them are skipped, stock phrases over
quiet audio are dropped, and runaway repeats are cut off. The language is
detected from the first window that clearly holds speech.

English uses Whisper's English-only weights, which are more accurate for
English. Model files come from Hugging Face the first time and are kept in the
browser's cache; ONNX Runtime itself is served from this site.

### Cutting without clipping words

Whisper's word timings are good but not exact: ends tend to be early, and
fillers are usually left out of the transcript entirely. So cuts are never
placed right at a word's edge. Each kept word gets a little padding, extended
while the audio is still loud, and cut boundaries are pulled into the quietest
nearby moment of the loudness envelope measured at import. A pause longer than
the limit keeps that limit, split so the beat falls naturally between the
words.

The loudness thresholds are read from each recording's own room tone and
speech level, not fixed. That's also how the ums Whisper didn't write down get
cut: a short sound standing alone between words, which no transcribed word
accounts for, goes with the fillers. Whisper often stretches the word before
or after an um over it, or slides a word onto it, so each word is first given
back its own sound — punctuation says which side of a pause a word belongs
to — and only then is the um left standing alone.

Everything stored is on the recording's own clock; the edited timeline is
derived from it whenever an edit changes, so edits never have to be re-timed.

### One renderer for preview and export

The preview plays the source in a hidden video element and jumps over cuts as
it reaches them, drawing each frame onto a canvas with the same function the
export uses: background, the picture with its punch-in, captions, hook card,
progress bar. What you see while editing is what lands in the file.

Export decodes source frames with WebCodecs (via mediabunny), only at the size
the composition needs, draws each output frame, and encodes H.264 and AAC into
an MP4 with the phone's own encoders — the format Photos, TikTok and Reels all
take. Speech is joined with a 10 ms crossfade at every cut so nothing clicks,
and music is looped, mixed and ducked under the voice. Where WebCodecs
encoding isn't available (iOS before 26), the edit is played through in real
time and captured with MediaRecorder instead, which also writes MP4 on an
iPhone.

## Layout

```
src/
  lib/          the editing rules, all pure and tested
    types.ts      the project shape and the two clocks
    timeline.ts   which spans of the recording survive the edit; source ⇄ edited time
    cuts.ts       pause and filler detection
    pages.ts      words into caption pages
    zooms.ts      automatic punch-ins
    emoji.ts      on-device keyword and emoji picks
    subtitles.ts  SRT and VTT
    format.ts     output sizes and where the picture goes
    project.ts    defaults, and reading saved projects defensively
  captions/     the ten caption looks and the canvas renderer
  render/       one finished frame (compose.ts) from a plan of the edit (plan.ts)
  transcribe/   Whisper in a worker, chunking and word clean-up
  media/        probing, audio decoding, export, sharing
  ai/           the optional Claude tools
  store/        projects and videos in IndexedDB
  components/   the screens: home, editor and its panels, recorder, settings
```

## Privacy

Videos, transcripts and projects live in the browser's storage on the phone.
Nothing is uploaded. The only network traffic is the one-time model download
from Hugging Face and, if you add a key and tap a Claude tool, the transcript
text sent to Anthropic.

## Development

```sh
cd cutline
npm install
npm run dev            # http://localhost:5173
npm test               # the editing rules, layout maths, storage, AI request shapes
npm run build
FIXTURES=<dir> node tests/smoke.mjs   # after a build: the whole flow in a phone-sized browser
npm run icons          # redraws the icons with Playwright's Chromium
```

`tests/smoke.mjs` imports a talking video, waits for transcription, runs the AI
Edit, changes styles and framing, exports and checks the file with ffprobe,
then records a take with Chromium's fake camera. It serves a copy of
`Xenova/whisper-tiny` from a local stand-in for Hugging Face, so it runs
offline. `tests/site.mjs` runs it under its Pages sub-path and then with the
server gone, `tests/older-safari.mjs` as on iPhones before iOS 26, and
`tests/transcribe.mjs` and `tests/media.mjs` check Whisper and the export on
their own; see [tests/README.md](tests/README.md).

Things only a real iPhone can confirm: export speed, lip sync after the AAC
encoder's start-up delay, and how HDR clips look once drawn on a canvas.
