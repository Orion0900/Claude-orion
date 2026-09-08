# CaddieIQ

A caddie in your pocket. It knows where you're standing, draws the line to
the flag with the yardage on it, and tells you what club to hit — then learns
what *you* actually hit each club, shot by shot, and plans with your numbers
instead of a chart.

> 152 to the flag, water short-right. Balanced player: 7 iron, carries the
> water 94% of the time. Safe player: lay up to a full wedge.

## Installing it on an iPhone

It's a web app that installs like a native one. Once the site is deployed
(see below):

1. Open **https://orion0900.github.io/Claude-orion/caddie/** in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

It gets its own icon, launches full screen, and keeps working when the
signal drops on the back nine. iOS only offers Add to Home Screen from
Safari.

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which builds
this app into `/caddie/` on the GitHub Pages site next to LoopMaker and
EasyPedal. Merging is the only step.

## What it does

- **Finds the course you're on.** One tap pulls every mapped hole within a
  mile and a half from OpenStreetMap: tees, greens, bunkers, water, pins where
  someone has mapped them. Not every course is mapped, so any hole can also be
  set by hand: tap the map where the flag is.
- **GPS and the line.** A live dot for you, a flag for the hole, a dashed line
  between them with the distance written on it. Front and back of the green
  too, when the green's outline is known. Yards or meters.
- **Tells you the club.** The recommendation card reads like a caddie:
  *Go for it — 7 iron. 148 yd ±9, target 152. 12% hazard, 71% on the green.*
  Then why: what it carries, what it has to carry over, and what the other
  play is.
- **Player and mindset toggles.** Beginner, intermediate, advanced or scratch
  sets the stock distances and how much a shot scatters. Safe, balanced or
  aggressive sets how much hazard risk the caddie accepts, whether it aims at
  the flag or the middle of the green, and how far it lays up.
- **Tracks every shot.** Mark a shot standing over the ball; the next mark
  measures how far it went. Pick the club (it starts on the caddie's
  suggestion), hit **Holed out** at the end. Type a distance if the GPS was
  off. Undo is one tap.
- **Learns you.** Three tracked shots with a club start moving its number;
  eight and the caddie trusts your average over the chart. Every plan says
  where its number came from.
- **Coaches.** The Coach tab compares your real numbers with the chart, spots
  a habit of coming up short on approaches, and points out when a 3 wood is
  tighter than your driver for barely any distance lost.

## How the caddie decides

1. **Every club gets a number.** Stock carry for your level blended with your
   tracked shots: `(n × yours + 4 × chart) / (n + 4)`. Chips, pitches and
   shots under 45% of the stock carry don't count; the top and bottom 10% of
   the rest are trimmed so one shank doesn't move the average.
2. **The lie changes the numbers.** Rough: 7% shorter, 30% wider. Fairway
   bunker: 12% shorter, 45% wider, no woods. Driver only off a tee.
3. **The line is checked for trouble.** Every bunker and water hazard the
   straight line crosses becomes a window of yardages, and each club's odds of
   landing in one are computed from its carry and spread.
4. **Attack or lay up.** Clubs that can hit the number are ranked by how close
   they land and how much trouble they risk; safe players lean short, bolder
   ones lean long (amateurs come up short far more than long). If the club
   that reaches carries too much risk for your mindset — 6%, 15% or 30% —
   the caddie lays up: as far as it can for the aggressive player, to a full
   wedge for the safe one.
5. **Inside a full wedge** it's a pitch or a chip with the most lofted club in
   the bag, and those shots aren't used to learn distances.

## Data sources

| What              | Where from                                                   |
| ----------------- | ------------------------------------------------------------ |
| Holes and hazards | OpenStreetMap via the Overpass API (`golf=*`, `natural=water`) |
| Map tiles         | OpenStreetMap                                                |
| Your position     | The phone's GPS, filtered for accuracy and impossible speed  |

Everything you track stays on the phone. Nothing is sent anywhere.

## Not yet

Wind, elevation change and slope aren't in the numbers. Neither is lateral
dispersion, so a hazard beside the line doesn't count, only one across it.

## Development

```sh
cd caddie
npm install
npm run dev      # http://localhost:5173
npm test         # the caddie's logic, hole parsing, shot log
npm run build
```
