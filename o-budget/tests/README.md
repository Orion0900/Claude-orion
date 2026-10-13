# Browser checks

A script that drives the built app in headless Chromium on an iPhone-sized,
touch-enabled screen. It serves `dist/` and `dist-artifact/` itself.

```bash
npm run build
npm run artifact
node tests/smoke.mjs
```

It opens on the budget as written down and checks every number: $3,900 twice
a month making $7,800, the split, the expenses $53 over Living, the 401k
coming out before the paycheck and the run down to $500. It switches the 401k
to come out of the paycheck and back. Then it takes a raise and puts it back, tries every
2 weeks and once a month, fills in gross income and a bonus by dollars and by
percent, splits by percent, by the slider and by the Living amount, ticks off a payday
and starts the next one, edits, moves and adds steps (and closes a blank
one), changes, removes and restores a subscription and adds one, breaks Car
down into items without its total moving, adds a category, deletes one and
undoes it, and reloads to find it all still there.

Then the artifact build, with a stand-in for the artifact's database: the
loading screen, the shared budget arriving, an edit written back, another
device's change showing up, a budget saved by the first version opening
unchanged and saving in the new shape, an empty database opening an empty
budget, and no database at all. It fails on any page or console error. Set
`SHOTS=<dir>` to save screenshots along the way.

`node tests/look.mjs <dir>` saves screenshots of the phone in both themes,
the subscriptions popout and a wide screen.
