# Browser checks

Scripts that drive the built game in headless Chromium on an iPhone-sized,
touch-enabled screen. Each serves `dist/` itself.

```bash
npm run build
node tests/smoke.mjs     # menus, a song start, taps, pause and quit
node tests/bot.mjs       # the bot plays a whole song; fails without a full combo
node tests/import.mjs    # imports a zipped chart through the file picker and plays it
node tests/perf.mjs      # frame cost with the CPU slowed 4x
```

`bot.mjs` takes `SONG`, `DIFF`, `RATE` (default 1.5), `SCHEME` (`tap` or
`guitar`) and `LANDSCAPE=1`. `import.mjs` builds its song in
`fixtures.mjs`: a generated `.chart`, `song.ini` and click track, zipped.
Set `SHOTS=<dir>` on any of them to save screenshots along the way.
