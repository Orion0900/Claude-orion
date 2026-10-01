# 92 Hard

A 75 Hard-style challenge, made longer and made yours: 92 days, four tasks,
every single day. Miss one and you start over at Day 1.

1. **Gym 15 sets + neck / half marathon**
2. **100× Hyperextensions**
3. **Maker School 1×**
4. **Vlog 1×**

Start on October 1st and Day 92 lands on December 31st: the whole quarter.

## Installing it on an iPhone

It's a web app that installs like a native one. Once the site is deployed
(see below):

1. Open **https://orion0900.github.io/Claude-orion/92hard/** in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

It gets its own icon, launches full screen, and opens with no signal, which
matters in a basement gym. iOS only offers Add to Home Screen from Safari.

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which builds
this app into `/92hard/` on the GitHub Pages site next to the others. Merging
is the only step.

## What it does

- **Today, at a glance.** The day number, huge, and a ring that fills a
  segment for each task done. Finish all four and the number turns volt.
- **Gym or a half marathon.** Fifteen pips fill as you tap **+ Set** between
  sets, and **Neck** is its own tick, because the gym only counts with both.
  Ran a half marathon instead? One tap covers the task for the day.
- **Hyperextensions by the set.** +10, +15, +20 or +25 at a time toward 100,
  with undo. Tap the count to type an exact number.
- **Maker School and the vlog** are one tap each, and every day has a note.
- **The rule, enforced.** Open the app after a day that wasn't finished and
  it says so before anything else: log it now if you did it and forgot to
  tick it, or start over at Day 1.
- **The board.** All 92 days, a week to a row: done, today, missed, still to
  come. Tap a past day to see or fix its log.
- **Totals and attempts.** Sets, hyperextensions, Maker School sessions,
  vlogs and half marathons for the run so far. Every earlier attempt is kept
  with how far it got, and the longest run is the one to beat.
- **Start when you like.** Today, tomorrow, or already part-way in: say which
  day you're on and the days before it count as done.
- **Backups.** The whole run as one file through the share sheet: Save to
  Files, AirDrop, Mail. Restore it from Settings, or from the start screen of
  a new phone.
- **Celebrations, rationed.** Finishing a day gets a toast and confetti;
  finishing Day 92 gets the whole screen. Nothing else does.

## How the count works

- A day is a calendar day on the phone's clock, turning over at midnight.
  Dates are counted on the date alone, so a daylight saving change can never
  make a day vanish or repeat.
- Every day before today has to be done. The first one that isn't ends the
  run; today is never missed while it's still today.
- A day can be logged late. Training at night and ticking it off in the
  morning is fine; it's an honesty system, like the original.
- Starting over files the run under Attempts with how many days in a row it
  held. A do-over on Day 1 with nothing done isn't counted as an attempt.

## Why there are no reminders

An iPhone web app can only show a notification when a server pushes one, and
92 Hard has no server. A daily Reminder or alarm in iOS does the job.

## Data

Everything stays on the phone, in the app's own storage, and the app asks
for that storage to be kept. Nothing is sent anywhere. If the phone ever
refuses to save, the app says so and points at the backup.

## Development

```sh
cd 92hard
npm install
npm run dev            # http://localhost:5173
npm test               # the rules: counting, missed days, restarts, totals, backups
npm run build
node tests/smoke.mjs   # after a build: walks a whole run in a phone-sized browser
npm run icons          # redraws the icons with Playwright's Chromium
```
