# Browser checks

A script that drives the built app in headless Chromium on an iPhone-sized,
touch-enabled screen. It serves `dist/` and `dist-artifact/` itself.

```bash
npm run build
npm run artifact
node tests/smoke.mjs
```

It opens on the two goals folded up, opens 10% bodyfat onto its plan of
attack (eight steps to the finish line) and ticks steps off. Then it marks
the goal changed with a note, undoes it, cancels a scrap, marks it changed
and complete (down to Complete, with both marks in its history) and back in
progress, and scraps Find my dream and undoes it. In the edit popout it
renames the goal, changes the finish line, adds a step and moves it up,
removes one and undoes it, and leaves a blank step that isn't kept. It closes
a blank new goal (not kept), adds one with its plan, deletes it and undoes
it, scraps it, and reloads to find it all still there.

Then the artifact build, with a stand-in for the artifact's database: the
loading screen, the shared plan arriving, a tick written back, another
device's change showing up, a plan written by hand with plain-text steps,
an empty database opening on an empty plan ready for its first goal, and no
database at all. It fails on any page or console error. Set `SHOTS=<dir>` to
save screenshots along the way.

`node tests/look.mjs <dir>` saves screenshots of the phone with the goals
folded and opened in both themes, a status being changed, the edit popout
and a wide screen.
