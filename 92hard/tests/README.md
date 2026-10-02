# Browser checks

A script that drives the built app in headless Chromium on an iPhone-sized,
touch-enabled screen, with the clock pinned so every day of a run can be
visited. It serves `dist/` itself.

```bash
npm run build
node tests/smoke.mjs
```

It starts a run on Thursday, October 1st and ticks the lift, checks the
routine's now and next and the Plan tab, picks up the vlog from October 2nd,
takes Saturday as the rest day with its half marathon, makes the week's 100
hyperextensions on its last day, skips a day and logs it late, ends a week
short of 100 and starts over from yesterday, fills that day in, moves Day 1
back a day and fills that one in too (stepping between days in the sheet),
tops up an earlier day from Today, backs up, erases and restores, fills in a
day an earlier version counted as done, starts a run tomorrow, opens a run
saved by the first version, and finishes all 92 days. It fails on any page or console error. Set `SHOTS=<dir>` to save
screenshots along the way.
