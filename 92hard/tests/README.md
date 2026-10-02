# Browser checks

A script that drives the built app in headless Chromium on an iPhone-sized,
touch-enabled screen, with the clock pinned so every day of a run can be
visited. It serves `dist/` itself.

```bash
npm run build
node tests/smoke.mjs
```

It starts a run on Thursday, October 1st and lifts (fifteen sets, then upper
or lower), checks the routine's now and next and the Plan tab, takes
Saturday as the rest day with its half marathon, makes the week's 100
hyperextensions on its last day, skips a day and logs it late, ends a week
short of 100 and starts over part-way in, backs up, erases and restores,
starts a run tomorrow, opens a run saved by the first version, and finishes
all 92 days. It fails on any page or console error. Set `SHOTS=<dir>` to save
screenshots along the way.
