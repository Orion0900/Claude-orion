# Browser checks

A script that plays the built game in headless Chromium on an iPhone-sized,
touch-enabled screen. It serves `dist/` itself.

```bash
npm run build
node tests/smoke.mjs
```

It opens a firm, then for twelve quarters answers every decision, buys the
cheapest building it can (bidding, diligence and closing through the deal
screens), ends the quarter and reads the letter. Then it gets an offer and a
refinancing quote on a building, checks the funds, firm and research screens
and the glossary, reloads to check the save, and retires into the hall of
fame. It fails on any page or console error. Set `SHOTS=<dir>` to save
screenshots along the way and `QUARTERS=<n>` to play longer.
