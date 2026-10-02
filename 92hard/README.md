# 92 Hard

A 75 Hard-style challenge, made longer and made yours: the rules, routine and
reasons from the whiteboard, for 92 days. Fail = Start Over.

1. **Lift 6× a week, 15 sets a day**
2. **Half Marathon Saturdays**
3. **Neck on Uppers**
4. **100× Hyperextensions a week**
5. **Maker School 1× a day**

Start on October 1st and Day 92 lands on December 31st: the whole quarter.

## Installing it on an iPhone

It's a web app that installs like a native one. Once the site is deployed
(see below):

1. Open **https://orion0900.github.io/Claude-orion/92hard/** in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

It gets its own icon, launches full screen, and opens with no signal, which
matters in a basement gym. iOS only offers Add to Home Screen from Safari.
Already installed? It picks up new versions by itself the next time it opens
with a connection, and keeps the run you've logged.

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which builds
this app into `/92hard/` on the GitHub Pages site next to the others. Merging
is the only step.

## What it does

Three tabs: **Today**, **Plan** and **Progress**.

- **Today, at a glance.** The day number, huge, and a ring with a segment for
  each thing today asks for. Finish them all and the number turns volt.
- **Now and next.** The routine for the time of day: "Now: Maker School till
  8:30 AM. Next: Work, 9:00 AM." Tap it for the whole plan.
- **Lift.** Fifteen pips fill as you tap **+ Set** between sets. Then pick
  **Upper + neck** or **Lower**: the lift counts with fifteen sets and one of
  those, so neck is never skipped on an upper day. Six lifts a week means one
  day off, so the card has a **Rest day** button, and it goes once it's used.
- **Half marathon** appears on Saturdays, and only then.
- **Hyperextensions by the set.** +10, +15, +20 or +25 at a time toward the
  week's 100, with undo. Tap the count to type today's exact number.
- **Maker School** is one tap.
- **The plan.** The whiteboard, word for word: why, the rules, the routine
  with today's part marked, happiness, and the offer.
- **The rule, enforced.** Open the app after a day that wasn't finished and
  it says so before anything else, and what was missing: log it now if you
  did it and forgot to tick it, or start over at Day 1.
- **Fill in days after the fact.** Any day from Day 1 up to today can be
  logged late. **Fill in an earlier day** at the bottom of Today opens
  yesterday, and the arrows in that sheet step back and forth through the
  run. A past day with nothing logged asks to be filled in.
- **The 92.** All 92 days, a week to a row: done, today, missed, still to
  come. Tap a day to fill in or fix its log.
- **Totals and attempts.** Lifts, sets, hyperextensions, Maker School
  sessions and half marathons for the run so far. Every earlier attempt is
  kept with how far it got, and the longest run is the one to beat.
- **Day 1 is any date.** Yesterday, today, tomorrow, or another date from
  the phone's picker. Started before you had the app? Pick the real Day 1
  and fill in the days since. **Change Day 1** on Progress moves it later
  on, and every log stays on the day it happened.
- **Backups.** The whole run as one file through the share sheet: Save to
  Files, AirDrop, Mail. Restore it from Progress, or from the start screen of
  a new phone.
- **Celebrations, rationed.** Finishing a day gets a toast and confetti;
  finishing Day 92 gets the whole screen. Nothing else does.

## How the count works

- Weeks are counted from Day 1, so every week has seven days and one
  Saturday, whatever day the run began. With an October 1st start they run
  Thursday to Wednesday. Day 92 is a week of one day on its own.
- **Every day:** Maker School, and a lift (15 sets, upper with neck or lower)
  or the week's one rest day. Six lifts a week falls out of that: a second
  rest day in the same week doesn't count.
- **Saturdays:** a half marathon too.
- **The last day of each week:** the week's hyperextensions, added up across
  its days, have to reach 100. Day 92 owes none, and neither does a week the
  app only saw part of (runs saved by an earlier version could count days
  as done without a log; those can be filled in instead).
- A day is a calendar day on the phone's clock, turning over at midnight.
  Dates are counted on the date alone, so a daylight saving change can never
  make a day vanish or repeat.
- Every day before today has to be done. The first one that isn't ends the
  run; today is never missed while it's still today.
- A day can be logged late. Training at night and ticking it off in the
  morning is fine, and so is filling in days from before the app; it's an
  honesty system, like the original. A day with nothing logged at all is
  treated as one to fill in, not a fail, until you fill it in or start
  over.
- Starting over files the run under Attempts with how many days in a row it
  held. A do-over on Day 1 with nothing done isn't counted as an attempt.

## The routine

From the whiteboard, shown on the Plan tab and in Today's now-and-next line:

| | |
| --- | --- |
| Sleep | 8:30 PM–4:30 AM |
| M–F | 5–6 AM Gym · 7–8:30 AM Maker School · 9 AM–5 PM Work |
| Saturday | 6:30 AM Maker School · 9:30 AM Half Marathon · X:00 Date Night |
| Sunday | 6:30 AM Maker School · 12:00 PM Magic · 5:30 PM Friends & Family Dinner |

To change it, edit [`src/lib/plan.ts`](src/lib/plan.ts); the rules are in
[`src/lib/tasks.ts`](src/lib/tasks.ts).

## Why there are no reminders

An iPhone web app can only show a notification when a server pushes one, and
92 Hard has no server. A daily Reminder or alarm in iOS does the job.

## Data

Everything stays on the phone, in the app's own storage, and the app asks
for that storage to be kept. Nothing is sent anywhere. If the phone ever
refuses to save, the app says so and points at the backup. Runs and backups
from the first version (which had a vlog and daily hyperextensions) open in
this one: a gym day with neck ticked reads as an upper day.

## Development

```sh
cd 92hard
npm install
npm run dev            # http://localhost:5173
npm test               # the rules: days, weeks, rest days, hyperextensions, misses, restarts, the routine, backups
npm run build
node tests/smoke.mjs   # after a build: walks a run in a phone-sized browser
npm run icons          # redraws the icons with Playwright's Chromium
```
