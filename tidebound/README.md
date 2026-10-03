# Tidebound

A monster-taming RPG for the browser in the style of the classic handheld
games of the early 2000s — the sea-blue one in particular. Catch wild beasts
in tall grass, raise a team of six, battle trainers turn by turn, beat three
Wardens for their Crests, ride the waves between islands, stop a crew of
salvage pirates and climb the lighthouse to face the Champion.

> Choose NARLET at the lab, beat your rival SKYE on the spot, catch a ZAPPET
> on Route 2, crack BRECK's stone defence with a TIDE move, fish a SPINEFIN
> off the beach road and ride it out to the old wreck.

Everything is original and generated in code — 43 beasts, every tile and
person, the font, the music and every sound. There are no image, audio or
font files. The mechanics are deliberately familiar; the world, story and
creatures are the game's own.

## Playing it

Open **https://orion0900.github.io/Claude-orion/tidebound/**. It plays with a
keyboard, a gamepad, or the on-screen buttons on a phone, and installs to the
home screen to play offline.

| Button | Keyboard | Gamepad | Phone |
|---|---|---|---|
| Move | Arrows / WASD | D-pad or stick | D-pad |
| A — talk, confirm | Z, Space or Enter | A | A |
| B — cancel; hold to run | X, Backspace or Shift | B | B |
| START — menu | Esc or M | Start | START |
| SELECT — fish | C or Tab | Back | SELECT |

Tap a direction to turn on the spot; hold it to walk. Hold B to run once Mum
gives you the SPRINT SHOES.

### On iPhone

1. Open the link above in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open Tidebound from its icon. It runs full screen, upright or sideways,
   clear of the notch and the home bar, and works offline from then on.

Tap the screen to start; sound comes on with that first tap and plays even
with the silent switch on. Tapping the game screen works as A, and in menus
picks the item you tap (in the bag, shop and Beastiary, tap once to look and
again to choose). The game saves by itself whenever you're out exploring and
when you leave the app, so closing it never loses your place; SAVE in the
START menu still works too. The home-screen app keeps its own save, separate
from Safari's.

## What's in it

- **43 original beasts** across 17 types, with evolutions, front and back
  battle sprites, party icons, rare shiny colours and a cry each.
- **Turn-based battles** with the handheld rules: stats and individual
  values, physical and special moves, STAB, type matchups, critical hits,
  stat stages, burn/poison/paralysis/sleep/freeze, accuracy, priority,
  multi-hit, recoil and drain, switching, experience and levelling, learning
  moves, evolving, catching with shaking orbs, and running away.
- **103 moves** with original names, each with its own animation style.
- **A whole island chain:** three towns and a city, four routes, a glowing
  cave, a shipwreck, a lagoon village on stilts and Beacon Isle, joined
  seamlessly with no loading screens between outdoor areas.
- **The story:** the lab and your first beast, a rival, the TIDEWRACK CREW,
  three Wardens, the ATOLL legend, the Champion and the credits — then a
  legendary waiting in the shrine.
- **Everything around it:** the START menu, BEASTIARY, party and summary
  screens, a bag with pockets, Markets, Havens that heal, PC storage,
  surfing, fishing, ledges, trainers who spot you, a trainer card, saving,
  and options for text speed, battle animations, volume and window frames.
- **Chip-style music:** 28 original tracks and 9 jingles, plus sound
  effects and a cry for every beast, synthesised live with WebAudio.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle into dist/
npm test         # unit tests
npm run icons    # redraw the home-screen icons from the game's art
```

For testing, `?quick` starts a new game at once. Add
`&party=kindlet:14,zappet:11` for beasts, `&items=orb:10,salve:3` for items,
`&at=route2,5,8` to start somewhere else, and `&flags=…` for story flags.

## How it's built

- **The screen is 240×160.** Everything draws at that size — 16 px tiles, a
  bitmap font with a drop shadow, framed windows — and the canvas is scaled
  up with whole-number nearest-neighbour scaling.
- **Contracts first.** `src/battle/types.ts` (the battle engine and the
  battle screen), `src/art/*/index.ts` (the art), `src/audio/api.ts` (sound),
  `src/world/terrain.ts` (map cells) and `src/data/dex.ts` (who each beast
  is) are the seams between the parts.
- `src/battle` is a pure rules engine. It resolves a turn and returns events
  ("hp slides from 30 to 12", "it's super effective") ending in a prompt;
  `src/scenes/battle` animates them.
- `src/art` draws every sprite into plain RGBA buffers, testable in Node.
  Creatures are built from shaded parts with hue-tinted outlines; tiles blend
  their edges from their neighbours.
- `src/world` is the overworld: grid movement, doors and seamless edges,
  trainers' lines of sight, encounters, surfing and fishing. Maps are laid
  out in code with a small paint kit and checked by tests. Cutscenes are
  async scripts: `await s.say(…)`, `await s.walk(rival, 'u3r')`,
  `await s.battle(trainer)`.
- `src/audio` sequences original songs written in a compact note notation
  and plays them on pulse, wave and noise voices.
- [`docs/DESIGN.md`](docs/DESIGN.md) has the design: types, formulas,
  species, the region and the story.

Tidebound is a fan-made homage to a genre. Its creatures, characters, world,
music and art are its own, and it isn't affiliated with any existing game or
its makers.
