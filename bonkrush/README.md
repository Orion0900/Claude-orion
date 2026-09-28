# Bonkrush

A low-poly 3D survivors roguelike for the browser, in the spirit of
**Megabonk**. Your weapons fire on their own. Your job is to move: run, jump,
slide down hills for speed, and bunny-hop through the horde. Level up, stack
upgrades, open chests, use shrines, summon the boss when you're ready, and
get out before the final swarm.

> Slide down a hill at three times running speed, jump over a wall of
> goblins, land in a charge shrine, take a legendary Tome of Plenty, and
> watch forty bones bounce through the crowd.

Built with Three.js and TypeScript. It needs no assets: every model, sound
and song is generated in code.

## Playing it

Open **https://orion0900.github.io/Claude-orion/bonkrush/** on a computer
with a keyboard and mouse. It also plays on phones and tablets with touch
controls.

| Action | Keyboard & mouse | Touch |
|---|---|---|
| Move | WASD / arrows | Left thumb |
| Look | Mouse (click the game to capture it) | Drag on the right |
| Jump, and jump again in the air | Space | ⤒ |
| Slide (hold) | Shift or Ctrl | ⤓ |
| Open, use, summon | E | ✋ |
| Map and stats (hold) | Tab | — |
| Pause | Esc or P | ❚❚ |

**The trick is sliding downhill.** A slide on a long slope builds speed far
past running pace, and jumping out of it keeps that speed. Chain jumps the
moment you land and you keep it.

## How a run goes

- **Three stages:** Greenwood, Sunscorch Dunes and Hollow Crypt, on 10, 9 and
  8 minute clocks. Weapons, tomes, items and your level carry over between
  them.
- **Level up** from XP shards and pick one of three cards. A card is a new
  weapon, a new tome, or an upgrade to one you own. Each card rolls a rarity
  from common to legendary, and luck pushes the odds up. You get rerolls,
  skips and banishes.
- **Four weapon slots and four tome slots.**
  - There are 16 weapons, including the sword, bone, firestaff, storm rod,
    aura, chunkers, bananarang, frostwalker, tornado and homing daggers.
  - There are 23 tomes.
  - Items have no limit: 35 of them, from Oats to Big Bonk, come out of
    chests.
- **Gold buys chests,** and each paid chest costs more than the last. Pots
  break for gold, XP, health and sometimes silver.
- **Shrines:**
  - Charge shrines: stand in the ring, then pick a stat boon.
  - Greed shrines: gold now, harder enemies.
  - Magnet shrines: pull every pickup on the map to you.
  - Challenge shrines: kill a pack of elites for a free chest.
  - Curse shrines: harder enemies, extra boss loot.
- **The boss:** find the skull altar and summon the boss whenever you like.
  Later bosses are tougher, but so are you by then. Beating it opens the
  portal to the next stage.
- **The final swarm:** when the clock hits zero, ghosts pour in and never
  stop, and they get stronger every 30 seconds. Take the portal or don't.
- **Silver** comes from every run and unlocks five more characters, each
  with its own starting weapon and passive.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle into dist/
npm test         # unit tests
```

Add `?play=vix` to skip the menus, or `?seed=123` for a repeatable run.
`?bot` makes every menu pick for itself, for unattended play-tests.

### Deploying it

Every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). It builds
this game into `/bonkrush/` on the GitHub Pages site next to LoopMaker,
EasyPedal and CaddieIQ.

## How it's built

- `src/game/types.ts` is the contract. Each system implements one interface
  and reaches the others only through the shared `GameContext`, so every
  folder can be replaced or tested on its own.
- `src/game/Game.ts` is the shell. It owns the renderer and the loop, builds
  the systems in order for each run and stage, and handles death, stage
  changes and victory.
- **Systems, one per folder:**
  - `world` – terrain, props, sky
  - `player` – movement and model
  - `camera`
  - `input`
  - `enemies` – AI, bosses and the spawn director
  - `weapons`
  - `pickups`
  - `interactables` – chests, pots, shrines, altar, portal
  - `progression` – stats, tomes, items, offers, XP
  - `fx` – particles, damage numbers, shake
  - `audio` – synth sound and music
  - `ui` – DOM menus and HUD
- **Anything numerous is one `InstancedMesh`:** enemies, projectiles,
  pickups and particles. A horde of hundreds costs a handful of draw calls.
- **All randomness is seeded,** so a seed replays the same map and rolls.
- [`docs/DESIGN.md`](docs/DESIGN.md) has every number: movement tuning, the
  weapon table, tomes, items, enemies, the spawn director and the economy.

Bonkrush is a fan-made homage. It uses its own names, models and sounds, and
isn't affiliated with Megabonk or its developer.
