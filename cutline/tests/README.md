# Browser checks

Scripts that drive Cutline in headless Chromium. None of them run in `npm test`;
they need a build or a dev server, and test media from outside the repo.

```bash
npm run build
FIXTURES=<dir> node tests/smoke.mjs
```

`smoke.mjs` is the whole product on an iPhone-sized, touch-enabled screen: it
imports a talking video, waits for on-device transcription, runs the AI Edit,
cuts and restores a word, switches caption styles and framing, adds a hook,
plays, exports and checks the file with `ffprobe` (size, sound, and that its
length is the edited length), reloads to check the project was kept, records a
take with Chromium's fake camera, and opens Settings. It fails on any page or
console error. Set `SHOTS=<dir>` to keep screenshots along the way.

`FIXTURES` must hold `talk.webm` (a short talking clip, VP9 and Opus, since
Chromium has no H.264) and `models/Xenova/whisper-tiny/` in Hugging Face's
layout. The harness serves that model from a local stand-in for huggingface.co,
for every model size the app asks for, so the check runs offline.

Three more drive the built app the same way, with the same `FIXTURES`:

- `site.mjs` serves it as GitHub Pages does, under `/Claude-orion/cutline/`
  next to the site's root app and its service worker (build that too, with
  `npm ci && npm run build` at the repo root, or that part is skipped). It
  checks that Cutline's own service worker takes over its pages, the manifest
  and Home Screen icon, transcription with ONNX Runtime from the app's folder,
  and a 1080×1920 export; then stops the server and does it all again offline.
- `older-safari.mjs [ios17|ios16]` takes away what iPhones before iOS 26 lack
  (audio WebCodecs, or WebCodecs altogether) and reports Apple as the vendor,
  so transcription decodes audio the old way and the export falls back to
  recording the edit in real time. The file must be an MP4 of the edited
  length, with sound.
- `fillers.mjs` takes `CLIP=<talking clip>` and `OUT=<dir>`: it transcribes the
  clip, runs the AI Edit, exports, then transcribes the export, and prints
  both transcripts so you can see which words and ums survived. The stored
  project (word timings and loudness envelope) is saved to `OUT` for a closer
  look. A clip with ums at known times, such as one made with a speech
  synthesiser over room tone, makes it a precise check.

The other scripts exercise one module each against the real browser APIs:
`transcribe.mjs` (Whisper in its worker), `media.mjs` (probing, decoding and
both export paths) and `captions-gallery.mjs` (renders every caption style to
PNGs for a visual check).
