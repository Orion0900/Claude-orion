# O-Budget

Orion's budget as an app. The net paycheck and how often it comes, which make
the month's income, and how that splits between **Investing** and **Living**;
gross pay and bonus beside it; the steps to run every payday in order; and
where Living goes, category by category, with a popout for the details, like
each subscription. Every number can be changed in place, and every total
follows.

It opens on the budget as written down:

| | |
|---|---|
| Income | $7,800 a month: a $3,900 net paycheck, twice a month |
| Gross pay | gross income and bonus, a year, to fill in |
| Investing | $4,000 (51.3%) |
| Living | $3,800 (48.7%) |
| Paycheck process | 0 — $405 into the 401k, before the paycheck lands · 1 — $1,500 into VTI · 2 — $1,900 for the next 2 weeks |
| Living expenses | Rent, utils, park $1,380 · STNDRD $1,000 · Car $250 · Subscriptions $223 (RCF, Cap Hill Fitness, Claude, HBO, Spotify, iCloud, NFL, Soundcloud, WSJ, Chase) · Food $800 · Haircut $100 · Medical $100 |

Two things the app shows that the note didn't add up: the expenses come to
**$3,853**, not $3,740, which is **$53 more than Living**; and with the 401k
taken out before the paycheck, VTI and the next two weeks use $3,400 of each
$3,900 paycheck, leaving **$500** that no step accounts for.

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

**Income.** The month's income, big, made from the **net paycheck** and how
often it's **paid**: every week, every 2 weeks, twice a month or once a month.
Under them, the paychecks in a year and the year's take-home. One slider sets
the split: cobalt for Investing, amber for Living. Or type either side in
dollars or as a percent of income. Each side shows what it is per paycheck,
and a line under them says how the living expenses compare: "$53 over" or
"$47 to spare".

**Gross pay.** Gross income and bonus, a year, before taxes. The bonus can be
typed in dollars or as a percent of gross. Under them: the two together, gross
income a month, and take-home as a share of gross. Neither is part of the
monthly income, which runs on the paycheck.

**Paycheck process.** The steps to run each payday, numbered from 0 the way
the note numbers them, starting from the paycheck and ending with what's left
over. Under each step is what's left of the paycheck after it. A step can be
marked as coming out before the paycheck, like the 401k: it sits above
"Paycheck lands" with a dashed ring, and the paycheck doesn't pay for it. Tap a step's
circle to tick it off; **Start next paycheck** clears the ticks. Tap the step
itself to change its words and amount, move it earlier or later, or delete
it. A step that asks for more than is left shows the paycheck as short.

**Living expenses.** The total against Living, on a bar that runs red past
Living when spending is over, then every category with its amount, a bar for
its share of Living and that share as a percent. Tap a category for its
popout:

- its name and monthly amount, and what that is per paycheck and per year
  (the subscriptions come to $2,676 a year);
- **Details**: the items it's made of, each with its own amount. With items,
  the category's amount is their total. The first item added starts with the
  category's whole amount, so breaking a category down never drops it to $0
  on the way;
- notes, for due dates, accounts or anything else;
- **Delete category**.

**Investment projection.** Enter an upfront amount, what goes in each
month (it starts at the Investing amount), the 401k each month (it starts
at the steps taken out before the paycheck, $810), a yearly return and the years,
and a line chart shows the total value year by year against what was put
in, with the end total, the amount put in and the growth above it. Tap or
drag across the chart for any year. It compounds monthly at a steady
return, before taxes and inflation.

Deleting a category, step or item offers **Undo** for a few seconds. A new
step or category that's closed while still blank isn't kept.

## How the numbers work

- The month's income is the net paycheck times the paychecks in a year (52,
  26, 24 or 12), over twelve months. Every two weeks is an average: $3,900
  makes $8,450 a month, though most months bring two paychecks ($7,800) and
  two months bring three, and the app says so under the paycheck.
- Per-paycheck amounts divide by the paychecks a month (26 ÷ 12 for every two
  weeks). On the Investing and Living tiles they round to whole dollars.
- Investing is kept in dollars and Living is the rest of income. A bigger
  paycheck keeps Investing where it is and moves Living, so a raise shows up
  as room in the living expenses. A percent typed into either side sets
  Investing to that share of the current income.
- Gross income and bonus are a year and stay out of the monthly income.
  Take-home is a year of net paychecks as a share of gross income.
- The paycheck process starts from one paycheck and takes each step's amount
  off in order, except the steps that come out before the paycheck.
- Amounts keep cents when they have them ($4.99) and round to the cent.

## Where it's saved

In the installed app, in the phone's `localStorage` under `o-budget.state`,
written a moment after each change and straight away when the app is put
away. A budget saved by the first version, which kept a monthly income,
opens unchanged: its paycheck is worked back from that income. In a budget
saved before steps could be marked as coming out before the paycheck, a 401k
step is moved there. In the artifact, in the artifact's database as the document
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
cadence, take-home against gross, the split, per paycheck, the paycheck run,
category totals and the expenses against Living), every edit, reading back
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
  App.tsx             the three sections, the popouts and Undo
  components/         Income, Gross pay, Paycheck process, Living expenses, the popout, fields
scripts/
  make-icons.mjs      the Home Screen icons
  build-artifact.mjs  the single-page artifact
tests/                browser checks
```
