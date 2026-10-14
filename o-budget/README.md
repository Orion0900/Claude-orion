# O-Budget

Orion's budget as an app, built around a budgeting system that runs itself:

1. **$1,450 straight into VTI** every paycheck.
2. **Chase Sapphire for fixed expenses**, and STNDRD is pulled from it too.
3. **The Amazon card for everything variable** (food, gas, random), $1,000 a
   month. It's the only account to watch.

The app shows the month split into **Investing** and **Living**, where every
dollar of each paycheck goes, a check-in for the Amazon card against its
$1,000, and every category in detail with a popout.

It opens on the budget as written down:

| | |
|---|---|
| Income | $7,800 a month: a $3,900 net paycheck, twice a month ($405 into the 401k comes out before it) |
| Investing | $3,900: VTI $2,900 (markets) · STNDRD $1,000 (self investment) |
| Living, fixed (Chase Sapphire) | $2,053: Rent, utils, park $1,380 · Car $250 · Subscriptions $223 (10 items) · Haircut $100 · Medical $100 |
| Living, variable (Amazon card) | $1,000: Food $600 · Gas $150 · Random $250 |
| Left over | $847 a month |
| Each paycheck | $3,900 lands · VTI $1,450 · set aside $1,527 for Chase (fixed + STNDRD) · $500 for Amazon · $423 stays in checking |

## Installing it on an iPhone

It's a web app that installs like a native one. Once the site is deployed
(see below):

1. Open **https://orion0900.github.io/Claude-orion/o-budget/** in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

It gets its own icon, launches full screen and opens with no signal. The
budget is kept on the phone, and an installed app picks up new versions by
itself the next time it opens with a connection, keeping the budget.

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which builds
this app into `/o-budget/` on the GitHub Pages site next to the others. Merging
is the only step.

### As a Claude artifact

`npm run artifact` builds the same app as one self-contained page for a Claude
artifact. There the budget is kept in the artifact's own database instead of
the phone, so it's the same on every device the artifact is opened on, and
Claude can read or change it on request. The artifact build starts empty and
loads the budget from that database.

## What it does

**This month.** The month's income, big, from the **net paycheck** and how
often it's **paid**. One bar splits it: cobalt Investing, amber Living,
hatched for what's left over. Tap the Investing or Living tile to jump to its
detail.

**Each paycheck.** The three rules of the system, then the paycheck dollar by
dollar from the moment it lands: each investment, what to set aside for each
card's bill (self investment like STNDRD is pulled from the fixed card, so
it's set aside with the fixed bills), and what stays in checking. The 401k
comes out before the paycheck, so it's noted under the net paycheck instead. It's built from the categories, so
it always matches the budget. Tick rows off on payday; **Start next
paycheck** clears them.

**Amazon card check-in.** Type what's on the card so far this month, whenever
you look. It shows what's left of the variable budget, a meter with where an
even pace would be today, and how much a day is left for the rest of the
month. It starts over each month.

**Investing** and **Living.** Each total, its share of income and per
paycheck, then its two halves: markets and self investment (paid from
Investing, not grown by the projection); fixed and variable, each with the
card it goes on (tap the card name to rename it). Living lists the biggest
expenses first. Tap any category for its
popout: amount, per paycheck and per year, **Details** (items like each
subscription, which set the amount), where it goes, notes, and delete.

**Investment projection.** Upfront, each month (starts at the markets
investing), the 401k each month, a yearly return and the years (typed or slid), drawn as a
line chart against what was put in. Tap or drag across it for any year.

**Gross pay.** Gross income and bonus a year, and the 401k each paycheck.

Deleting a category or item offers **Undo** for a few seconds. A new category
closed while still blank isn't kept.

## How the numbers work

- The month's income is the net paycheck times the paychecks in a year (52,
  26, 24 or 12), over twelve months. The 401k comes out before the net
  paycheck, so it's not part of it.
- Investing and Living are the sums of their categories; left over is income
  less both.
- Each paycheck's rows are the monthly amounts over the paychecks a month,
  rounded to whole dollars so they add up to the paycheck exactly.
- The card check-in's pace is the variable budget spread evenly over the
  month's days; a balance typed last month counts as $0 this month.
- Every amount shows and is entered in whole dollars.

## Where it's saved

In the installed app, in the phone's `localStorage` under `o-budget.state`,
written a moment after each change and straight away when the app is put
away. A budget saved by the first version, which kept a monthly income,
opens unchanged: its paycheck is worked back from that income. A budget saved
before the card system moves onto it: the 401k from its steps, VTI at $1,450
a paycheck if there was no investment, and food, gas and random as the
$1,000 variable budget. In the artifact, in the artifact's database as the document
`budget/main`, with a copy in the browser. Edits show at once and are written
one at a time; a change made on another device shows up unless an edit made
here is still on its way. The header says where the budget is saved.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # into dist/
npm run artifact   # into dist-artifact/o-budget.html
npm run icons      # redraws the Home Screen icons
```

## Tests

Unit tests (`npm test`) cover the sums (income from the paycheck and its
cadence, take-home against gross, the four buckets, the paycheck plan, the
card check-in and its pace, category totals), every edit, reading back
saved budgets, including broken ones and the first version's, and the save
and sync rules with a stand-in database. The browser checks in [`tests/`](tests/README.md) drive
the built app on an iPhone-sized screen.

## Layout

```
src/
  lib/money.ts        dollars and percents in and out of text
  lib/budget.ts       the budget: Orion's numbers, the sums and the edits
  lib/storage.ts      the phone's copy
  lib/sync.ts         saving, and the artifact's database
  useBudget.ts        the budget on screen and the one way to change it
  App.tsx             the sections, the popout and Undo
  components/         This month, Each paycheck, card check-in, Investing/Living, projection, gross pay, the popout, fields
scripts/
  make-icons.mjs      the Home Screen icons
  build-artifact.mjs  the single-page artifact
tests/                browser checks
```
