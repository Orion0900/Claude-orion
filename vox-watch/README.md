# Vox watch

A daily list of the apartments available at
[Vox](https://www.essexapartmenthomes.com/apartments/seattle/vox/floor-plans-and-pricing)
(1527 15th Ave, Capitol Hill, Seattle): unit, layout, size, the direction it
faces, rent and move-in date.

```
Vox: 4 available (Oct 7)
- #205 · Studio · 397 sq ft · faces South · $1,459 · avail Oct 11
- #209 · 2BR/2BA · 944 sq ft · faces East · $3,067 · avail now
- #406 · 1BR/1BA · 534 sq ft · faces South · $2,127 · avail now · NEW
- #409 · 2BR/2BA · 943 sq ft · faces East · $2,977 · avail now
```

## How it works

- **Units.** Essex's site sits behind a bot checkpoint, but the interactive map
  on its Floor Plans & Pricing page is a SightMap embed whose public JSON lists
  the same available units. `check.mjs` reads it.
- **Direction.** SightMap's floor plate drawing is north up, with East Pine St
  along the top and 15th Ave down the right. `facing.mjs` finds each unit's
  outside walls (a line drawn straight out leaves the floor before hitting
  another room) and names the compass directions they face; corner units get
  two, like "North & East".
- **NEW** marks a unit that wasn't listed the day before.

## Schedule

`.github/workflows/vox-watch.yml` runs at 10:17 and 11:17 Pacific and
force-pushes `latest.md` and `latest.json` to the `vox-watch-data` branch. A
Claude routine reads `latest.md` at 11:51 and sends it as a push notification.

```
npm test            # facing.mjs unit tests
npm run check       # live check, writes out/latest.md
```
