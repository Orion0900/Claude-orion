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

- **Asks where you are before anything else.** Opening the app puts two
  questions first: which course you're at, then which hole you're starting on.
  The course search lists every mapped course within a mile and a half —
  by name, hole count and how far away it is — so a club and the muni across
  the road don't get merged into one. The hole grid shows par per hole and
  offers the one you're standing closest to. Nine holes in, or starting on the
  back nine, you pick the hole rather than being dropped on the first.
- **Courses from the map, or by hand.** Tees, greens, bunkers, water and pins
  come from OpenStreetMap. Not every course is mapped, so **Set it up by hand**
  gives you eighteen holes to fill in: pick a number and tap where the flag is,
  as you play.
- **GPS and the line.** A live dot for you, a flag for the hole, a dashed line
  between them with the distance written on it. Front and back of the green
  too, when the green's outline is known. Yards or meters.
- **Tells you the club.** One card, one call: **Send it — 7 iron, 148 yd**,
  with the reasons as chips rather than paragraphs — 💦 carries it 94%,
  ⛳ 71% on, 📈 your 10 shots.
- **Two dials.** 🐢 😎 🔥 on the main screen sets how much hazard risk the
  caddie accepts, whether it aims at the flag or the middle of the green, and
  how far it lays up. Your level lives in Settings and sets the stock
  distances and how much a shot scatters.
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

## How it looks, and why

It's read at arm's length, in the sun, sometimes with a glove on. That
settles most of the design:

- **Light, not dark.** In direct sunlight dark-on-light gives the most
  usable contrast. The yardage sits around 17:1 against the page, well past
  the AAA bar, with a paper-coloured halo so it survives being drawn over
  grass or water. The whole palette flips for anyone whose phone is in dark
  mode.
- **One loud thing per screen.** The yardage owns the map; the club owns the
  card. Everything else is a chip, a pill or an icon.
- **The primary action never moves.** Club strip and **Mark shot** are docked
  above the tab bar in the thumb's easy reach, so they're never scrolled off.
  Every target clears 44px.
- **Motion explains, never delays.** Presses dip in 130ms; cards and chips
  rise in 220ms on a decelerating curve; the setup steps slide at 450ms.
  Springy overshoot is kept for the club card, which is a small reward.
- **The number never rolls.** Rolling digits are unreadable at the exact
  moment you're reading them, so a changed yardage flashes instead.
- **Confetti is rationed.** It fires for a birdie or better, and nothing
  else — a party for every routine tap stops meaning anything.
- **`prefers-reduced-motion` turns all of it off**, with no loss of function.

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
