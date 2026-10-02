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

The other scripts exercise one module each against the real browser APIs:
`transcribe.mjs` (Whisper in its worker), `media.mjs` (probing, decoding and
both export paths) and `captions-gallery.mjs` (renders every caption style to
PNGs for a visual check).
