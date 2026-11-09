# O-Plan

Orion's life plan as an app: every goal on a card, folded up like a question
on an FAQ page. Tap one and it drops down to the plan of attack, step by step,
to the finish line. Every goal can be marked **changed**, **complete** or
**scrapped** at any time, and put back in progress just as easily. Goals come
and go: add one, or delete one, whenever the plan moves.

It opens on the two goals as written down:

| Goal | Finish line | The plan of attack |
|---|---|---|
| **10% bodyfat** | 10% or under on a DEXA scan | Get a starting number · find maintenance · eat 300–500 under it · protein every day · keep lifting heavy · 10k steps and 7–9 hours of sleep · check in every Sunday · re-measure every 8 weeks |
| **Find my dream** | One sentence you'd bet the next five years on, with the first project started | A 30-day energy log · the times you lost track of time · your perfect ordinary Tuesday, 10 years out · talk to five people living a life you want · one new thing a week · shortlist three directions · a 30-day experiment on each · commit to the winner |

## Installing it on an iPhone

It's a web app that installs like a native one. Once the site is deployed
(see below):

1. Open **https://orion0900.github.io/Claude-orion/o-plan/** in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

It gets its own icon, launches full screen and opens with no signal. The
plan is kept on the phone, and an installed app picks up new versions by
itself the next time it opens with a connection, keeping the plan.

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which builds
this app into `/o-plan/` on the GitHub Pages site next to the others. Merging
is the only step.

### As a Claude artifact

`npm run artifact` builds the same app as one self-contained page for a Claude
artifact. There the plan is kept in the artifact's own database instead of
the phone, so it's the same on every device the artifact is opened on, and
Claude can read it or change it on request ("add a goal to run a sub-1:40
half"). The artifact build starts empty and loads the plan from that
database.

## What it does

**In play.** Every goal in progress or changed, in the order they were
added, with how many steps are done across them. Each card shows the goal,
where it stands and a bar for its steps. The O in the header fills the same
way, clockwise from the dot at the top.

**The plan of attack.** Tap a goal to open it: the plan in a sentence or two,
then the steps as a route, numbered in the order you'll take them, ending at
the **finish line**, what done looks like. Tap a step to tick it off; the
trail behind it lights up. Once every step is done it asks whether you're at
the finish line.

**Where it stands.** In progress, changed, complete or scrapped, any time,
from any of them. Pick one and it asks for a note (what changed, what it took,
why it's scrapped), which can be left blank. Every mark is kept under it with
its day, starting with the day the goal started, so a goal that changed twice
shows both. Marking offers **Undo** for a few seconds.

**Complete** and **Scrapped.** Goals that leave play drop to their own lists
below, outlined instead of filled, scrapped ones struck through. Open one and
put it back in progress to bring it back.

**Edit plan.** The popout for a goal: its name, the finish line, the plan of
attack, and the steps, each with a line for how or why. Add a step, move one
up or down, or remove one (with **Undo**). **Delete goal** takes it off the
plan for good, also with **Undo**. A goal closed while still blank isn't
kept, and nor is a step left empty.

**Add a goal** opens a blank one in the popout, ready to name.

## Where it's saved

In the installed app, in the phone's `localStorage` under `o-plan.state`,
written a moment after each change and straight away when the app is put
away. In the artifact, in the artifact's database as the document
`plan/main`, with a copy in the browser. Edits show at once and are written
one at a time; a change made on another device shows up unless an edit made
here is still on its way. The header says where the plan is saved.

The saved plan is plain JSON: `goals`, each with `title`, `finish`,
`approach`, `steps` (`text`, `detail`, `done`), `status` (`active`,
`changed`, `complete` or `scrapped`) and `log`, the marks it's had. A goal
written by hand can leave out anything but the title, and its steps can be
plain text; the app fills in the rest.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # into dist/
npm run artifact   # into dist-artifact/o-plan.html
npm run icons      # redraws the Home Screen icons
```

## Tests

Unit tests (`npm test`) cover Orion's two goals, every status from every
status and the history it leaves, ticking, adding, editing, moving and
removing steps, adding and removing goals, reading back saved plans,
including broken and hand-written ones, and the save and sync rules with a
stand-in database. The browser checks in [`tests/`](tests/README.md) drive the
built app on an iPhone-sized screen.

## Layout

```
src/
  lib/plan.ts         the plan: Orion's goals, statuses, the edits, reading it back
  lib/storage.ts      the phone's copy
  lib/sync.ts         saving, and the artifact's database
  usePlan.ts          the plan on screen and the one way to change it
  App.tsx             In play, Complete and Scrapped, the popout and Undo
  components/         the goal card, the edit popout, the O, fields and icons
scripts/
  make-icons.mjs      the Home Screen icons
  build-artifact.mjs  the single-page artifact
tests/                browser checks
```
