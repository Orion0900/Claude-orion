# Browser checks

A script that drives the built app in headless Chromium on an iPhone-sized,
touch-enabled screen, with the clock pinned so every day of a run can be
visited. It serves `dist/` itself.

```bash
npm run build
node tests/smoke.mjs
```

It starts a run on October 1st, ticks off a whole day, skips a day and logs
it late, misses another and starts over part-way in, backs up, erases and
restores, starts a run tomorrow, and finishes all 92 days. It fails on any
page or console error. Set `SHOTS=<dir>` to save screenshots along the way.
