# Tidebound — design

Tidebound is a browser game in the spirit of the classic handheld
monster-taming RPGs of the early 2000s, and of the sea-blue one in
particular: a tropical island region, lots of water, three starters, wild
beasts in tall grass, turn-based battles, capture orbs, Wardens to beat and a
legendary waiting at the end.

**Everything is original.** Every creature, name, character, place, line of
dialogue, sprite, tile and melody is made for this game. The *mechanics* are
deliberately familiar (types, stats, levels, catching, a party of six), but
nothing is copied: no creature from any existing franchise, no existing
character, no existing map layout, no existing music. When in doubt, invent.

## Pillars

- **Feels like the handheld.** A 240×160 screen, 16×16 tiles, 60 fps, a
  pixel font, two-line text boxes, a START menu, grid movement, the swirl
  into battle. Scaled up crisp on any screen.
- **All generated in code.** No image, sound or font files: sprites are
  drawn from code into pixel buffers, music is sequenced chip-style synth.
- **Plays anywhere.** Keyboard, gamepad, or an on-screen D-pad and buttons
  on phones. Installs to the home screen and plays offline.
- **A whole little adventure.** Three Wardens, a villain crew, a rival, surf
  routes, a shipwreck, a lighthouse and a legendary: two to three hours.

## Glossary

| Here | Means |
|---|---|
| Beast | A creature. The party menu is BEASTS. |
| Beastiary | The creature encyclopedia (the START menu's first entry). |
| Orb | Capture device. ORB, SUPER ORB, HYPER ORB, TIDE ORB, DUSK ORB. |
| Haven | Healing house in each town: talk to the keeper to heal your party; a storage PC stands inside. Coral-pink roof. |
| Market | Shop. Amber roof. |
| Warden | A town's champion trainer, in a Warden Hall. Beating one gives a Crest. |
| Crest | Badge. CRAG CREST, SPARK CREST, TIDE CREST. |
| Shells (¤) | Money. |
| Tidewrack Crew | The villains: salvage pirates. |

## Screen and tech

- Native resolution **240×160**, integer-scaled with nearest-neighbour.
- Tiles are **16×16**; the view is 15×10 tiles with the player centred.
- People are **16×32** sprites standing on one cell.
- Battle sprites are **64×64**; party icons **32×32**.
- Fixed **60 Hz** update. Walking takes 16 frames per tile, running 8.
- TypeScript + Vite, no runtime dependencies, Canvas 2D for drawing and
  WebAudio for sound. Pure logic (battle, data, maps) is unit tested with
  Vitest in Node.

## Art style

- **Palette:** bright, saturated, tropical. Grass `#68c050`, tall grass
  `#3c9838`, path `#e0c890`, sand `#f4e4a8`, water `#4890f0` with `#a8d8ff`
  highlights, tree green `#308838`, wood `#a06838`. Text is dark grey on
  white.
- **Light comes from the top left.** Every material has 3–4 tones: highlight,
  base, shade and deep shade.
- **Outlines** are 1 px, dark and tinted toward the object's hue (not pure
  black), e.g. `#203018` on foliage and `#302028` on people. Tiles for
  ground (grass, path, sand, water) have no outline; objects on them do.
- **Creatures** are chunky, readable and cute or cool, the way handheld
  sprites were: clear silhouettes, big eyes, 3–4 tones per colour, 1 px dark
  outline, a single-pixel highlight on each eye. Front sprites face left
  (toward the player's beast), filling roughly 40–56 px of the 64×64 frame
  depending on size class. Back sprites show the same beast from behind and
  slightly above, facing up-right, bigger in frame (about 48–60 px) and
  cropped at the bottom edge the way the player's side is.
- **People** are chibi: a head about 9–10 px tall on a 16×32 sprite, dark
  outline, 2-frame walk plus a standing frame, left mirrored from right.

## Types

Seventeen types. Attack type (rows) against defender type: `2` is super
effective, `½` not very effective, `0` no effect; blank is normal.
Dual-typed defenders multiply both.

| Attack ↓ / Def → | NOR | FLA | TID | LEA | VOL | FRO | BRA | TOX | EAR | GAL | MIN | BUG | STO | SPI | WYR | MET | SHA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NORMAL | | | | | | | | | | | | | ½ | 0 | | ½ | |
| FLAME | | ½ | ½ | 2 | | 2 | | | | | | 2 | ½ | | ½ | 2 | |
| TIDE | | 2 | ½ | ½ | | | | | 2 | | | | 2 | | ½ | | |
| LEAF | | ½ | 2 | ½ | | | | ½ | 2 | ½ | | ½ | 2 | | ½ | ½ | |
| VOLT | | | 2 | ½ | ½ | | | | 0 | 2 | | | | | ½ | 2 | |
| FROST | | ½ | ½ | 2 | | ½ | | | 2 | 2 | | | | | 2 | ½ | |
| BRAWL | 2 | | | | | 2 | | ½ | | ½ | ½ | ½ | 2 | 0 | | 2 | 2 |
| TOXIC | | | 2 | 2 | | | | ½ | ½ | | | | ½ | ½ | | 0 | |
| EARTH | | 2 | | ½ | 2 | | | 2 | | 0 | | ½ | 2 | | | 2 | |
| GALE | | | | 2 | ½ | | 2 | | | | | 2 | ½ | | | ½ | |
| MIND | | | | | | | 2 | 2 | | | ½ | | | | | ½ | 0 |
| BUG | | ½ | | 2 | | | ½ | ½ | | ½ | 2 | | | ½ | | ½ | 2 |
| STONE | | 2 | | | | 2 | ½ | | ½ | 2 | | 2 | | | | ½ | |
| SPIRIT | 0 | | | | | | | | | | 2 | | | 2 | | | ½ |
| WYRM | | | | | | | | | | | | | | | 2 | ½ | |
| METAL | | ½ | ½ | | ½ | 2 | | | | | | | 2 | | | ½ | |
| SHADE | | | | | | | ½ | | | | 2 | | | 2 | | | ½ |

Two deliberate differences from the genre's usual chart: **VOLT is super
effective on METAL** (it conducts) and **TOXIC is super effective on TIDE**
(it fouls the water).

## Stats and formulas

Six stats: HP, ATTACK, DEFENSE, SP. ATK, SP. DEF, SPEED. Each beast has
individual values (IVs) of 0–31 per stat, rolled when it is created. There
are no natures and no effort values.

- **HP** = ⌊(2·base + IV) · L / 100⌋ + L + 10
- **Other** = ⌊(2·base + IV) · L / 100⌋ + 5
- **Damage** = ⌊⌊⌊2L/5 + 2⌋ · power · A / D⌋ / 50⌋ + 2, then × STAB 1.5
  × type effectiveness × critical 2 (1/16 chance, 1/8 for high-crit moves;
  crits ignore the attacker's negative and the defender's positive stages)
  × random 0.85–1.00, then × 0.5 for a burned attacker's physical moves.
  Minimum 1 unless the type has no effect.
- **Category is per move:** physical moves use ATTACK/DEFENSE, special moves
  SP. ATK/SP. DEF.
- **Stat stages** run −6…+6: multiplier (2+s)/2 when raised, 2/(2−s) when
  lowered. Accuracy and evasion use thirds: (3+s)/3 and 3/(3−s).
- **Turn order:** higher priority first, then higher effective SPEED
  (paralysis quarters it), ties at random. Switching, items and running
  always go before moves.
- **Status:** burn (1/8 max HP a turn, halves physical damage), poison (1/8),
  bad poison (1/16, 2/16, 3/16…), paralysis (quarter speed, 25% can't move),
  sleep (1–3 turns, can't move), freeze (can't move, 20% thaw each turn,
  thawed by a FLAME move hitting it). One status at a time. FLAME types
  can't be burned, TOXIC and METAL can't be poisoned, FROST can't be frozen,
  VOLT can't be paralysed.
- **Struggle:** with no PP left a beast uses STRUGGLE (50 power, typeless,
  recoil ¼ of damage dealt).
- **Experience** on a faint: ⌊base yield · foe level / 7⌋, × 1.5 in trainer
  battles, split evenly among the party beasts that took part and are still
  standing. Growth curves: *fast* (0.8·n³), *medium* (n³), *slow* (1.25·n³).
  Level cap 100.
- **Catching:** a = ⌊(3·maxHP − 2·HP) · rate · orb / (3·maxHP)⌋ × status
  bonus (2 for sleep or freeze, 1.5 for paralysis, poison or burn). If
  a ≥ 255 it's caught; otherwise b = ⌊1048560 / √√(16711680 / a)⌋ and each of
  four shake checks passes when a random 0–65535 is below b. Shakes shown =
  checks passed, up to three.
- **Running:** always succeeds if your speed ≥ the foe's; otherwise
  chance = (speed·128/foeSpeed + 30·attempts) / 256.
- **Wild beasts** use a random move. Trainers pick the move that deals the
  most expected damage most of the time, and 'smart' trainers (Wardens,
  rival, villain boss, champion) use their healing items below a quarter HP.
- **Money:** a trainer pays prize × level of their last beast. Losing costs
  half your shells and returns you to the last Haven.

## Moves

About ninety moves with original names, in `src/data/moves.ts`. Each type
has a weak, a medium and a strong damaging move, and most have a status or
utility move. Physical and special are chosen per move to fit the flavour.
Effects include: burn/poison/paralysis/sleep/freeze chances, stat raises and
drops, flinch, recoil, draining, multi-hit, priority, high critical ratio,
healing, and fixed damage. Every move has a short description for the
summary screen and an animation style (`fx`) for the battle scene.

## Beasts

The 43 species, their looks and dex entries are in `src/data/dex.ts`. In
brief:

| # | Line | Types | Where |
|---|---|---|---|
| 1–3 | LEAFOLIN → FRONDOLIN (16) → CANOPANGOL (32) | Leaf, then Leaf/Earth | Starter |
| 4–6 | KINDLET → CINDERAM (16) → VOLCARAM (32) | Flame, then Flame/Stone | Starter |
| 7–9 | NARLET → NARWHELM (16) → TIDELANCE (32) | Tide, then Tide/Frost | Starter |
| 10–11 | TUBBARA → CAPYBARON (18) | Normal → Normal/Tide | Routes 1–2 |
| 12–13 | PUFFLET → PUFFINAUT (17) | Normal/Gale → Gale/Tide | Routes 1–3 |
| 14–15 | TWIGLING → TIMBERWALK (14) | Bug → Bug/Leaf | Routes 1–2 |
| 16–17 | LUMIGRUB → LANTERWING (15) | Bug → Bug/Volt | Glimmer Cave |
| 18–19 | ZAPPET → LEMURGE (20) | Volt | Route 2, Route 3 |
| 20–21 | PEBBLIT → CRAGOYLE (25) | Stone → Stone/Gale | Glimmer Cave |
| 22–23 | WOMBIT → WOMBASTION (22) | Earth → Earth/Stone | Route 2, cave |
| 24–25 | SPINEFIN → LIONSPIRE (24) | Toxic/Tide | Fishing, Route 4 |
| 26–27 | JABSHRIMP → CLOBBERCLAW (26) | Brawl → Brawl/Tide | Route 3 beach |
| 28–29 | CLIONETTE → SERAFIN (28) | Mind/Tide | Route 4 |
| 30–31 | TATTERLING → SAILWRAITH (27) | Spirit → Spirit/Gale | The wreck |
| 32–33 | MURKEEL → MORAYNIGHT (30) | Shade/Tide | Wreck, Route 4 |
| 34–35 | DUGLING → MANATIDE (30) | Tide → Tide/Normal | Fishing, Route 4 |
| 36–37 | COCRAB → COCONCLAW (25) | Leaf/Stone | Route 3 beach |
| 38 | BRANDGER | Flame/Brawl | Route 3 (rare) |
| 39–40 | SAWFRY → SAWBLADON (30) | Metal/Tide | Route 4 |
| 41–42 | DRIFTWYRM → TEMPESTWYRM (35) | Wyrm → Wyrm/Gale | Beacon Isle (rare) |
| 43 | ATOLLUS | Tide/Stone | Legendary, Atoll Shrine |

**Stat budgets** (sum of base stats): first stages 290–320, middle stages
400–430, final starters 525–535, other finals 440–500, singles like
BRANDGER about 450, TEMPESTWYRM 560, ATOLLUS 600. Starters are balanced
all-rounders with a lean: LEAFOLIN defensive and bulky, KINDLET attacking,
NARLET special and sturdy.

## The Azure Isles

A chain of tropical islands. The story runs south to north, then out to sea.

1. **Driftwood** — a sleepy beach village. The player's house, the rival's
   house, PROF. MARIS's lab by the shore.
2. **Route 1** — a short grassy path north with ledges. First wild beasts.
3. **Mossgrove** — a village in the woods: Haven, Market, a few houses.
4. **Route 2** — east through meadows and a pond; the first trainers.
5. **Glimmer Cave** — a cave full of glowing larvae; trainers and items.
6. **Basalt Town** — a hot-spring town at the foot of a volcano. Warden
   **BRECK** (Stone) and the CRAG CREST.
7. **Route 3** — south-east along a long beach: sand, palms, fishers and
   swimmers. A fisher gives you the DRIFT ROD.
8. **Sparkwharf** — a harbour city of cranes and lights. Warden **VOLTA**
   (Volt) and the SPARK CREST. The Tidewrack Crew raid the harbour; PROF.
   MARIS gives you the TIDE CHARM to follow them to sea.
9. **Route 4** — open sea between islands, surfing, swimmers and sailors.
   The **old wreck** rests on a sandbar: the Crew's hideout. Beat CAPTAIN
   SCRAG and get the WRECK KEY.
10. **Lagoona** — a town of stilt houses and piers on a lagoon. Warden
    **MARINA** (Tide) and the TIDE CREST.
11. **Beacon Isle** — the lighthouse at the end of the isles. Beat the
    rival once more at its foot, then climb to face **CHAMPION NERISSA** at
    the top. The ATOLL SHRINE on its shore wakes ATOLLUS once the Crew is
    beaten.

### Story beats

- PROF. MARIS introduces the world of beasts, then you choose a look and a
  name.
- Mum wakes you: today you get your first beast. At the lab, your rival
  **SKYE** is already waiting. You choose LEAFOLIN, KINDLET or NARLET; SKYE
  takes the one strong against yours and battles you on the spot.
- PROF. MARIS gives you the Beastiary and five ORBs; Mum gives you SPRINT
  SHOES on the way out.
- In Mossgrove, a Crew grunt is hassling the Market keeper over a crate of
  salvage. You chase them off.
- SKYE ambushes you again on Route 2 before Glimmer Cave.
- After the CRAG CREST, the path to Sparkwharf opens along the beach.
- At Sparkwharf the Crew steals PROF. MARIS's research on the legend of
  ATOLLUS. After the SPARK CREST, MARIS arrives and hands you the TIDE CHARM.
- On Route 4 you board the wreck, beat the grunts and CAPTAIN SCRAG, and get
  the research back. SCRAG meant to wake ATOLLUS and sell it.
- MARINA's hall in Lagoona gives the TIDE CREST. The Beacon Isle ferry
  opens.
- SKYE's final battle, then the lighthouse and CHAMPION NERISSA. Credits
  roll; the game continues after, with ATOLLUS waiting at the shrine.

## Sound

Chip-style synthesis: two pulse channels (12.5/25/50% duty), a soft
triangle-ish wave bass, and a noise channel for drums. Every melody is
original. Tracks: title (hopeful, sweeping), intro (gentle), home, town
(breezy, ukulele-like arps), city (bustling), route (walking tempo,
adventurous), routeSea (rolling 6/8), cave (sparse, echoing), lab, haven
(soft, warm), hall (tense, proud), wreck (eerie), surf (wide, sunny), beacon
(stately), rival (cheeky), villain (swaggering), battleWild (driving),
battleTrainer, battleWarden, battleRival, battleVillain, battleLegend
(epic), battleChampion (final), three victory tunes, evolution, credits.

Each species' cry is generated from its id: a short pitched chirp, growl or
trill whose pitch, shape and length come from the species' size and types.

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | Arrows / WASD | D-pad / left stick | D-pad |
| A (talk, confirm) | Z / Space / Enter | A (south) | A |
| B (cancel, hold to run) | X / Backspace / Shift | B (east) | B |
| START (menu) | Esc / M | Start | START |
| SELECT | C / Tab | Back | SELECT |
