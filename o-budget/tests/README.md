# Browser checks

A script that drives the built app in headless Chromium on an iPhone-sized,
touch-enabled screen. It serves `dist/` and `dist-artifact/` itself.

```bash
npm run build
npm run artifact
node tests/smoke.mjs
```

It opens on the budget as written down and checks every number: the split,
$3,900 a paycheck, the expenses $53 over Living and the paycheck run down to
$95. Then it takes a raise and puts it back, splits by percent, by the slider
and by the Living amount, changes the paychecks a month, ticks off a payday
and starts the next one, edits, moves and adds steps (and closes a blank
one), changes, removes and restores a subscription and adds one, breaks Car
down into items without its total moving, adds a category, deletes one and
undoes it, and reloads to find it all still there.

Then the artifact build, with a stand-in for the artifact's database: the
loading screen, the shared budget arriving, an edit written back, another
device's change showing up, an empty database opening an empty budget, and
no database at all. It fails on any page or console error. Set
`SHOTS=<dir>` to save screenshots along the way.

`node tests/look.mjs <dir>` saves screenshots of the phone in both themes,
the subscriptions popout and a wide screen.
