# Bonkrush — design

Bonkrush is a browser game in the spirit of Megabonk: a low-poly 3D
survivors-like where your weapons fire on their own and your job is to move.
You run, jump, slide and bunny-hop across hilly maps while hordes close in.
You pick upgrades on level-up, buy chests with gold, use shrines, summon the
boss when you're ready and survive the final swarm.

All names here are original. The mechanics are deliberately familiar.

Units are metres and seconds, and the player is about 1.8 m tall.
`src/game/types.ts` is the code contract; this file is the content and tuning.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows | Left thumb joystick (appears where you touch) |
| Look | Mouse (pointer lock; click the game to capture) | Drag on the right half |
| Jump / air jump | Space | ⤒ button |
| Slide | Shift, C or right mouse (hold) | ⤓ button (hold) |
| Interact (chest, shrine, altar, portal) | E | ✋ button (shows only when something is in reach) |
| Pause | Esc / P | ❚❚ button |
| Stats panel | Tab (hold) | In the pause menu |

## Movement

The movement is what makes the game fun. Tuning targets:

- **Run:** 7 m/s base (× moveSpeed). Ground acceleration 60 m/s², ground
  friction 10/s when there's no input. Air acceleration is 18 m/s² with no
  friction in the air.
- **Gravity** 28 m/s². Jump velocity is 10 m/s × √jumpHeight, for about a
  1.8 m jump. Coyote time is 0.1 s and the jump buffer is 0.12 s.
- **Air jumps:** `extraJumps` of them, each at 90% of jump velocity, with a
  puff ring.
- **Slide:** hold Slide while grounded and moving over 3 m/s. Entering a slide
  gives a burst of ×1.3 speed (only when the slide cooldown of 0.6 s is up).
  While sliding, friction drops to 0.3/s and steering is weak.
  - **Slopes are speed.** Downhill accelerates you at g × sin(slope) × 2.0,
    and uphill slows you at g × sin(slope). A long hill should take a slide
    to 3–4× base speed, the signature feel. Every map has a few long, smooth
    slide ramps (30–40 m at 15–25°) to make that happen on purpose.
  - The camera and hitbox drop, dust trails behind you, and the FOV widens
    with speed (70° → 85°).
- **Bunny hop:** jumping within 0.12 s of landing skips that landing's
  friction and adds +6% horizontal speed.
  - Slide-jumps keep the slide's speed, and diagonal strafing adds a little.
  - Hard cap is 4× base speed. Over run speed on the ground and not sliding,
    speed decays toward run speed at 6 m/s².
- **Terrain:** the player stands on `world.heightAt`. Steep cliffs over about
  50° can't be walked up, but you can jump up them. Solid props block the
  player as circles. Leaving the map is impossible; it's walled.
- **Fall damage:** a drop over 9 m deals `(drop − 9) × 4`, and landing while
  sliding cancels it, like the original.
- **Animation:** character models animate in a deliberately choppy,
  stop-motion way, with poses stepping at about 12 fps. Enemies bob and
  waddle.

## Run structure

- A run is **3 stages**: Greenwood (10:00), Sunscorch Dunes (9:00) and Hollow
  Crypt (8:00). The timer counts **down** on the HUD.
- **Encirclements** close in at 5:30 and 3:30 left, or 4:30 and 3:15 on
  stage 3. A ring of 30 + 10 × stage of the stage's first enemy spawns 16 m
  around you after a "SURROUNDED!" warning.
- **Minibosses** spawn at 7:00 and 2:00 left, or 6:30 and 3:00 on stage 3.
  - Greenwood: `stone_golem`
  - Dunes: `scorpion_king`
  - Crypt: `bone_colossus`
  - They are elite-sized, drop a free chest and are worth 25× XP.
- **Boss altar:** a skull archway at `world.spots.altar`. Interact with it
  anytime to summon the stage boss.
  - Boss HP scales with how late you call it:
    `bossHp × (1 + stageTime/60 × 0.35) × (1 + difficulty)`.
  - Killing the boss:
    - skips the timer to 0:10 left
    - drops a free chest
    - opens the **exit portal** where it died
- **Final swarm:** at 0:00 the HUD reads **FINAL SWARM**.
  - Ghosts pour in without stopping, get stronger every 30 s, and deal heavy
    knockback.
  - At +3:00 they turn purple (×2.5 HP and damage). At +6:00 they turn red
    (×6).
  - The portal still works, so you can leave anytime.
- **Stage 3:** stepping into its portal wins the run (victory screen). Dying
  anywhere shows the game-over screen.
- **Silver** is paid at the end of every run and spent on unlocking
  characters.

## Leveling

- XP needed for the next level: `xpToNext(L) = round(8 + 6L + 0.35L²)`, so
  14 at L1, 47 at L5, 103 at L10 and 268 at L20.
- XP shards come in three values: blue (1), green (5, from merging or tougher
  enemies) and red (25, from elites and bosses). Their value is multiplied by
  xpGain when collected.
- **Level-up** offers **3 cards**, plus 1 more at luck ≥ 1.
  - Each card is one of: a new weapon (if a slot is free), a weapon upgrade, a
    new tome (if a slot is free), or a tome upgrade.
  - Owned things are weighted ×2.
  - Each card rolls its rarity with luck (`progression/rarity.ts`).
- **Slots:** 4 weapons and 4 tomes. Items have no limit.
- **Per run:** 3 rerolls, 3 skips and 2 banishes. A skip gives 20% of the
  level's XP back as gold. A banish removes that card's weapon, tome or item
  from the run and deals fresh cards for the same level-up.
- **Weapon upgrade:** a Common roll raises 1–2 random upgradable stats.
  - Uncommon and above always raise 2 stats; the Anvil item makes it 3.
  - Each step is `upgrades[stat] × RARITY_MULT[rarity]`.
  - Count and bounce steps are +1, or +2 at legendary.
  - Weapons cap at level 40.
- **New tome:** gives one level at the card's rarity. Tomes cap at level 99.

## Rarity

| Rarity | Colour | Multiplier | Upgrade weight | Item weight |
|---|---|---|---|---|
| Common | green `#7ddc6a` | 1.0 | 60 | 70 |
| Uncommon | blue `#4aa8ff` | 1.2 | 25 | — |
| Rare | purple `#c86bff` | 1.4 | 10 | 15 |
| Epic | red `#ff4d5e` | 1.6 | 4 | 6 |
| Legendary | gold `#ffd23f` | 2.0 | 1.2 | 1.5 |

Luck shifts these weights (see `rarityWeights`).

## Player stats

These are the base values; `progression/stats.ts` holds them and the caps.

| Stat | Base | Notes |
|---|---|---|
| maxHp | 100 | |
| regen | 0 /s | |
| overheal | 0 | healing past max becomes shield |
| shield | 0 | recharges fully 4 s after the last hit, at 20%/s |
| armor | 0 | damage × (1 − armor), capped at 0.8 |
| evasion | 0 | dodge chance, capped at 0.75; shows "DODGE" |
| lifesteal | 0 | chance per hit to heal 1 HP (over 1: extra heal) |
| thorns | 0 | damage back to anything that hits you in melee |
| damage | 1.0 | |
| critChance | 5% | over 100% "overcrits" for ×critDamage² |
| critDamage | ×2 | |
| attackSpeed | 1.0 | cooldown ÷ attackSpeed |
| projectiles | +0 | |
| bounces | +0 | |
| size | 1.0 | |
| projectileSpeed | 1.0 | |
| duration | 1.0 | |
| eliteDamage | 1.0 | vs elites and bosses |
| knockback | 1.0 | |
| moveSpeed | 1.0 | × 7 m/s |
| extraJumps | 0 | |
| jumpHeight | 1.0 | |
| luck | 0 | |
| difficulty | 0 | more enemies (+spawn), HP and damage, and more XP and gold |
| pickupRange | 1.0 | × 3.5 m |
| xpGain | 1.0 | |
| goldGain | 1.0 | |
| silverGain | 1.0 | |

The player takes contact damage with **0.5 s i-frames** after each hit.

## Characters (`src/data/characters.ts`)

| id | Name | Model | Start weapon | Passive | Unlock |
|---|---|---|---|---|---|
| `vix` | Vix | fox | `firestaff` | +15% luck, +5% move speed | free |
| `sir_bonkalot` | Sir Bonkalot | knight | `sword` | +15% armor, +20 max HP | free |
| `rattles` | Rattles | skeleton | `bone` | +12% move speed, +8% damage | free |
| `gigabro` | Gigabro | ogre | `aura` | +40 max HP, +10% size, +1 regen/s | 60 silver |
| `b0lt` | B0LT | robot | `revolver` | +12% crit chance, +20% crit damage | 90 silver |
| `kage` | Kage | ninja | `katana` | +15% evasion, +10% attack speed | 120 silver |
| `bongo` | Bongo | monkey | `bananarang` | +1 extra jump, +10% pickup range | 150 silver |
| `frostine` | Frostine | wizard | `frostwalker` | +15% duration, +10% size, +10% XP | 200 silver |

## Weapons (`src/weapons/weaponDefs.ts`)

Damage is per hit before the player's damage stat. All weapons auto-fire.
"Target" means the nearest enemy within range. If nothing is in range,
aimed weapons fire forward along the player's facing.

| id | Name | Behavior | dmg | cd | count | size | speed | dur | pierce | bounce | range | kb | Upgrades (common step) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `sword` | Bonk Sword | Wide arc slash in front, 150° by 3.2 m | 16 | 1.1 | 1 | 3.2 | 0 | 0.2 | ∞ | 0 | 4 | 6 | damage 3, size 0.3, critChance 0.04, count 1 |
| `bone` | Bone | Thrown bone that bounces between enemies and off the ground | 11 | 1.0 | 1 | 0.5 | 18 | 3 | 1 | 3 | 20 | 3 | damage 2.5, bounces 1, count 1, speed 2 |
| `firestaff` | Firestaff | Fireball at target, explodes on hit for 2.5 m splash, burns | 14 | 1.4 | 1 | 2.5 | 16 | 3 | 1 | 0 | 25 | 4 | damage 3, size 0.35, count 1, cooldown -0.08 |
| `lightning` | Storm Rod | A bolt strikes the target from the sky and chains to nearby enemies | 18 | 1.6 | 1 | 1 | 0 | 0 | 1 | 3 | 22 | 1 | damage 4, bounces 1, count 1, cooldown -0.1 |
| `aura` | Bonk Aura | Damage ring around the player ticking every 0.4 s, 2.6 m radius | 6 | 0.4 | 1 | 2.6 | 0 | 0 | ∞ | 0 | 0 | 1 | damage 1.4, size 0.35 |
| `chunkers` | Chunkers | Rocks orbit the player at 2.8 m, 2.4 rad/s | 12 | 0.35 | 2 | 0.6 | 2.4 | 0 | ∞ | 0 | 2.8 | 8 | damage 2.5, count 1, size 0.12, speed 0.4 |
| `bow` | Longbow | Fast piercing arrows at target | 13 | 0.9 | 1 | 0.4 | 34 | 1.2 | 3 | 0 | 30 | 2 | damage 3, pierce 1, count 1, critChance 0.04 |
| `revolver` | Six-Shooter | Rapid shots at target that bounce to the next enemy | 9 | 0.45 | 1 | 0.25 | 40 | 1 | 1 | 1 | 26 | 2 | damage 2, count 1, bounces 1, critChance 0.05 |
| `katana` | Katana | Very fast short slashes at the nearest enemy, 25% crit | 11 | 0.55 | 1 | 2.4 | 0 | 0.15 | ∞ | 0 | 3.2 | 3 | damage 2.5, critChance 0.05, count 1, size 0.2 |
| `bananarang` | Bananarang | Boomerang flies 14 m out and back, hits both ways | 13 | 1.3 | 1 | 0.7 | 20 | 2 | ∞ | 0 | 14 | 5 | damage 3, count 1, size 0.1, speed 2 |
| `frostwalker` | Frostwalker | Icy footprints every 0.25 s while moving; 1.4 m patches that damage and slow, and a freeze pulse every cd | 9 | 2.5 | 1 | 1.4 | 0 | 3 | ∞ | 0 | 3 | 0 | damage 2, duration 0.5, size 0.2 |
| `flamewalker` | Flamewalker | Fire patches behind you while moving; burns | 7 | 0.25 | 1 | 1.3 | 0 | 2.5 | ∞ | 0 | 0 | 0 | damage 1.6, duration 0.4, size 0.15 |
| `axe` | Hurl Axe | Axes lobbed upward in an arc that spin and fall through enemies | 22 | 1.5 | 1 | 0.9 | 14 | 2 | ∞ | 0 | 12 | 6 | damage 4, count 1, size 0.12, duration 0.2 |
| `mines` | Pop Mines | Drops mines that arm in 0.5 s and blow up (3 m) when an enemy is near | 26 | 2.2 | 1 | 3 | 0 | 12 | ∞ | 0 | 1.2 | 8 | damage 5, count 1, size 0.3, duration 2 |
| `tornado` | Twister | Tornadoes wander outward, pulling enemies in and ticking damage | 8 | 3.0 | 1 | 1.6 | 5 | 4 | ∞ | 0 | 15 | -4 | damage 1.6, count 1, duration 0.6, size 0.2 |
| `dagger` | Homing Dagger | Daggers that curve to their target and never miss | 8 | 0.8 | 2 | 0.3 | 22 | 2 | 1 | 0 | 28 | 1 | damage 1.8, count 1, speed 2, critChance 0.03 |

- `count` means projectiles per activation, or orbiters for chunkers.
- For melee, extra count means extra slashes in alternating directions,
  0.08 s apart.
- **Default pool:** sword, bone, firestaff, lightning, aura, chunkers, bow,
  revolver, bananarang, frostwalker, flamewalker, axe, mines, tornado, dagger
  and katana.

## Tomes (`src/progression/tomeDefs.ts`)

Each tome grants its stat once per level at common rarity. Rarity
multiplies the step.

| id | Name | Per level |
|---|---|---|
| `damage` | Tome of Might | damage +0.08 |
| `cooldown` | Tome of Haste | attackSpeed +0.075 |
| `precision` | Tome of Precision | critChance +0.07 |
| `size` | Tome of Girth | size +0.10 |
| `velocity` | Tome of Velocity | projectileSpeed +0.15 |
| `knockback` | Tome of Shove | knockback +0.20 |
| `agility` | Tome of Agility | moveSpeed +0.08 |
| `vitality` | Tome of Vitality | maxHp +25 |
| `regen` | Tome of Mending | regen +0.7 |
| `shield` | Tome of Warding | shield +25 |
| `evasion` | Tome of Evasion | evasion +0.07 |
| `armor` | Tome of Iron | armor +0.08 |
| `golden` | Tome of Greed | goldGain +0.15 |
| `silver` | Tome of Silver | silverGain +0.12 |
| `attraction` | Tome of Attraction | pickupRange +0.25 |
| `bloody` | Tome of Blood | lifesteal +0.06 |
| `duration` | Tome of Lingering | duration +0.15 |
| `luck` | Tome of Fortune | luck +0.07 |
| `quantity` | Tome of Plenty | projectiles +1 (level-capped at 10) |
| `thorns` | Tome of Thorns | thorns +12 |
| `xp` | Tome of Wisdom | xpGain +0.09 |
| `cursed` | Cursed Tome | difficulty +0.08, xpGain +0.04, goldGain +0.04 |
| `chaos` | Tome of Chaos | +1 random stat step each level |

## Items (`src/progression/itemDefs.ts`)

Items stack without limit. Every "chance" rolls per hit or per event.

| id | Name | Rarity | Effect (per stack) |
|---|---|---|---|
| `protein_shake` | Protein Shake | common | damage +0.10 |
| `clover` | Four-Leaf Clover | common | luck +0.07 |
| `battery` | Battery | common | attackSpeed +0.08 |
| `oats` | Oats | common | maxHp +25 |
| `turbo_socks` | Turbo Socks | common | moveSpeed +0.12 |
| `medkit` | Medkit | common | regen +0.5 |
| `hourglass` | Hourglass | common | xpGain +0.08 |
| `golden_glove` | Golden Glove | common | goldGain +0.15 |
| `moldy_cheese` | Moldy Cheese | common | 12% chance on hit to poison (burn 25% of hit/s for 3 s) |
| `burger` | Burger | common | kills have 2% chance to drop a health snack |
| `feathers` | Feathers | common | jumpHeight +0.15 |
| `key` | Rusty Key | common | chests: free chance k/(k+1) with k = 0.1 × stacks |
| `slippery_ring` | Slippery Ring | rare | evasion +0.08 |
| `tactical_glasses` | Tactical Glasses | rare | +25% damage to enemies above 90% HP |
| `scarf` | Sky Scarf | rare | +30% damage while airborne |
| `cactus` | Pocket Cactus | rare | when hit, fire 8 spikes (15 dmg + thorns) around you |
| `brass_knuckles` | Brass Knuckles | rare | +25% damage to enemies within 4 m |
| `forbidden_juice` | Forbidden Juice | rare | critChance +0.10 |
| `beefy_ring` | Beefy Ring | rare | +10% damage per 100 max HP |
| `idle_juice` | Idle Juice | rare | up to +50% damage after standing still for 2 s |
| `wrench` | Wrench | rare | shrines charge 20% faster and roll one rarity higher 25% of the time |
| `backpack` | Backpack | rare | projectiles +1 |
| `demonic_blood` | Demonic Blood | epic | on hit, 8 s cooldown: heal 7.5% max HP and blast 4 m for 40 dmg |
| `toxic_barrel` | Toxic Barrel | epic | when hit, leave a 3 m poison cloud (10 dps, 4 s) |
| `phantom_shroud` | Phantom Shroud | epic | after a dodge, +100% damage and +30% move speed for 3 s |
| `ice_cube` | Ice Cube | epic | 10% chance on hit to freeze for 1.5 s (bosses: slow) |
| `spicy_meatball` | Spicy Meatball | epic | 20% chance on hit to explode for 65% of the hit in 2.5 m |
| `anvil` | Anvil | legendary | weapon upgrades roll 3 stats |
| `big_bonk` | Big Bonk | legendary | 2% chance on hit to deal ×20 damage (shows BONK!) |
| `soul_reaper` | Soul Reaper | legendary | kills release 1 homing soul (20 dmg), +1 per 2 more stacks |
| `vacuum` | Vacuum Magnet | legendary | every 15 s (−2 s per extra stack, min 5), pull all XP on the map |
| `holy_book` | Holy Book | legendary | maxHp +100, regen +2 |
| `reaper_dagger` | Reaper's Dagger | legendary | 1% chance on hit to execute a non-boss enemy |
| `stopwatch` | Stopwatch | legendary | once per stage, fatal damage instead leaves you at 1 HP, invulnerable for 2 s, and freezes enemies for 2 s |
| `storm_orb` | Storm Orb | legendary | 8% chance on hit to call lightning (50% of the hit, chains 2) |

## Enemies (`src/enemies/enemyDefs.ts`)

These are base numbers; the director scales them by time, stage and
difficulty.

| id | Stage | Behavior | HP | dmg | speed | radius | XP | Notes |
|---|---|---|---|---|---|---|---|---|
| `sprout` | 1 | chaser | 8 | 6 | 4.2 | 0.45 | 1 | little hopping plant |
| `goblin` | 1 | chaser | 16 | 8 | 4.6 | 0.5 | 1 | club-carrier |
| `bat` | 1 | flier | 7 | 5 | 6.5 | 0.4 | 1 | flits in swarms, ignores hills |
| `shroom` | 1 | ranged | 20 | 7 | 3 | 0.55 | 2 | keeps 12 m, lobs spores (7 dmg, 10 m/s, 2.5 s) |
| `boar` | 1 | charger | 34 | 12 | 3.8 | 0.7 | 3 | winds up 0.7 s, dashes 18 m/s |
| `treant` | 1 | tank | 110 | 16 | 2.4 | 1.1 | 6 | big, slow, knockback resistant |
| `scarab` | 2 | swarmer | 10 | 6 | 7 | 0.4 | 1 | fast flankers |
| `mummy` | 2 | chaser | 30 | 10 | 3.8 | 0.55 | 2 | |
| `vulture` | 2 | flier | 16 | 8 | 7 | 0.55 | 2 | |
| `scorpion` | 2 | ranged | 36 | 10 | 3.2 | 0.7 | 3 | fires stingers (10 dmg, 14 m/s, 2 s) |
| `cactoid` | 2 | exploder | 20 | 25 | 5.5 | 0.55 | 2 | blows up at 1.5 m for 3 m splash |
| `sand_golem` | 2 | tank | 220 | 22 | 2.4 | 1.3 | 8 | |
| `skeleton` | 3 | chaser | 44 | 12 | 4.4 | 0.5 | 2 | |
| `ghoul` | 3 | swarmer | 30 | 10 | 7.2 | 0.45 | 2 | |
| `wisp` | 3 | flier (ranged) | 36 | 10 | 5.5 | 0.45 | 3 | hovers, spits bolts (12 dmg, 15 m/s, 1.8 s) |
| `pumpkin_bomb` | 3 | exploder | 40 | 34 | 6 | 0.6 | 3 | |
| `gargoyle` | 3 | charger | 90 | 20 | 4.5 | 0.8 | 5 | |
| `crypt_knight` | 3 | tank | 380 | 30 | 2.8 | 1.1 | 10 | |
| `ghost` | swarm | chaser | 60 | 18 | 7.5 | 0.55 | 1 | final swarm; heavy knockback on hit |
| `stone_golem` | 1 mini | tank | 900 | 24 | 3.2 | 1.6 | 60 | ground slam: 5 m ring every 4 s |
| `scorpion_king` | 2 mini | ranged | 2200 | 30 | 3.6 | 1.6 | 120 | stinger fan of 5 |
| `bone_colossus` | 3 mini | tank | 5000 | 40 | 3.4 | 1.8 | 220 | slam and bone ring |
| `barkzilla` | 1 boss | boss | 6000 | 30 | 3.4 | 2.6 | 500 | root slam shockwave, seed spray ring, charge |
| `jackal_pharaoh` | 2 boss | boss | 16000 | 42 | 4 | 2.4 | 900 | sand spear volleys, dash, summons scarabs |
| `grave_warden` | 3 boss | boss | 40000 | 55 | 4 | 2.6 | 1500 | bone ring, teleport, summons skeletons, soul beam sweep |

### Elites

Each spawn has a `0.006 + 0.01 × minutes` chance (capped at 6%) to be an
elite.

- Elites are ×1.6 size, ×6 HP and ×1.5 damage, and give ×10 XP.
- They have a glowing outline colour and a floating ◆ marker.
- They have a 10% chance to drop a chest.

## Director (`src/enemies/director.ts`, pure)

- **Spawns per second:**
  `rate(t) = min(14, 1.6 + 1.5 × stage + 0.6 × min^1.25) × (1 + difficulty × 0.6)`,
  with `min = stageTime/60` and `stage` the 0-based stage index. The rate
  halves while a boss is alive.
  - Enemies spawn in clumps of 3–8 on a ring 28–40 m from the player, never
    inside view distance behind props, and inside the map.
- **Alive cap:** 300 (180 on low quality). When the map is at the cap, the
  furthest enemies (more than 45 m away) are recycled to new ring positions.
- **Roster unlocks** by stage time:
  - roster[0] from 0:00
  - roster[1] from 0:45
  - roster[2] from 1:45
  - roster[3] from 3:00
  - roster[4] from 4:30
  - roster[5] from 6:00
  - Weights favour the newest few.
- **Roster weights:** tanks weigh 0.12 and chargers 0.45 against the
  others, so each stage's big enemies stay a spice, not the staple.
- **HP scale:** `(1 + 0.10 × min)^1.35 × stage.enemyScale × (1 + difficulty)`.
- **Damage scale:** `(1 + 0.06 × min) × stage.enemyScale^0.6 × (1 + difficulty × 0.5)`.
- **Waves:** every 60 s, a themed burst of 20–40 of one roster type in a
  ring, plus a banner-less HUD pulse.
- **Final swarm:** the rate jumps to 14/s of `ghost`, and HP scales
  ×(1 + 0.25 × swarmSeconds/30), with purple and red tiers. Far-off regular
  enemies are cleared so the ghosts actually flood in instead of waiting for
  room under the cap.
- **Difficulty** is one number: the stat, which already includes greed and
  curse shrines. It raises spawns, HP and damage, and pays for itself: XP
  and gold per kill are × (1 + 0.5 × difficulty).
- **Stage XP:** every kill's XP is × 1, 1.3 and 2.0 on stages 1, 2 and 3.
- **Death fling:** a killed enemy is bonked away, tumbling for about half a
  second before it vanishes.

## Economy

- **Gold:** enemies have a 25% chance to drop 1–2 gold. Elites always drop
  8–15, minibosses 40 and bosses 100. The amount is multiplied by goldGain.
- **Chests:**
  - About 26 per map, placed at `world.spots.chests`.
  - Price: `round(25 × 1.18^paid + 4 × paid)`, giving 25, 34, 43, 53…
    `paid` counts the whole run, so prices keep climbing across stages.
  - Free chests come from bosses, minibosses, challenge shrines and the Rusty
    Key. They don't raise the price.
  - A chest gives one item rolled on the item table with luck. The UI shows a
    rarity-coloured reveal.
- **Pots:** about 40 per map.
  - Breaking one by touch or by any weapon hit gives 60% gold (2–6), 20% XP
    (5), 10% health (+20) and 10% nothing.
  - 1 in 12 pots is silver and drops 1–3 silver.
- **Shrines,** placed at `world.spots.shrines` (about 24 per map):
  - **Charge** (×12, teal):
    - Stand in the 3 m ring for 3 s. The progress drains at 2×/s when you
      step out.
    - When full, pick 1 of 3 stat boons, each rolled with luck.
    - Boon steps are one tome-level of a random stat × the rarity multiplier.
    - A golden shrine (1 in 10) is always legendary.
  - **Greed** (×4, gold): +40 gold (raw) and +8% difficulty for the rest of
    the run.
  - **Magnet** (×3, blue): vacuums every XP and gold pickup on the map.
  - **Challenge** (×3, purple): spawns 6 + stage × 3 elites around you. Kill
    them all to get a free chest at the shrine.
  - **Curse** (×2, red): +15% difficulty for the stage. The next boss or
    miniboss drops an extra free chest.
- **Pickups:**
  - Base magnet range is 3.5 m. Pickups accelerate toward the player and are
    collected at 0.8 m.
  - Health snacks heal 25.
  - A magnet powerup (rare drop, 0.4%) vacuums the whole map.
  - A bomb powerup (rare drop, 0.3%) deals 200 in 10 m.
- **Silver:** paid at the end of a run (`silverForRun`), including a run
  you quit, and spent on characters.

## HUD layout

- **Top left:**
  - HP bar with a blue shield overlay and a number
  - Level badge
  - Portraits of the 4 weapon slots and 4 tome slots, with their levels
- **Top centre:** the countdown timer, big (turns red and reads FINAL SWARM
  after zero), with the stage name under it.
- **Top right:**
  - Kills 💀
  - Gold 🪙, with the next chest price shown when a chest is in reach
  - Silver
  - A minimap, 140 px and rotating with the camera. It shows chests (yellow),
    shrines (teal/gold/blue/purple/red), the altar (skull) and the portal
    (purple), plus boss and elite dots.
- **Bottom:** a full-width XP bar.
- **Boss:** a boss HP bar appears top-centre, under the timer, while a boss
  is alive.
- **Centre-bottom:** the interaction prompt ("E — Open chest (34 🪙)").
- **Other:**
  - Banners fly in for events.
  - Toasts stack bottom-left.
  - Damage numbers (white; yellow for crits with "!"; red for damage to the
    player) are drawn on an overlay canvas.

## Menus

- **Title:** the logo **BONKRUSH**, then Play, Characters, Settings and
  Stats (bests). Silver is shown.
- **Character select:** a grid of cards with a spinning model preview, which
  can be a CSS/2D portrait. Each card shows the passive, the starting weapon
  and the unlock cost. Buy with silver.
- **Level-up:**
  - "LEVEL UP!", then 3–4 cards with rarity-coloured borders, glow and a
    label.
  - Each card has an icon, name, "NEW" or "Lv 3 → 4", and the exact stat
    changes.
  - Buttons: Reroll (n), Skip (n), Banish (n). Keys 1–4 pick, R rerolls.
- **Chest:** the chest shakes, bursts, and reveals the item with a
  rarity-coloured beam. Then "Take" (Space/Enter/click).
- **Shrine:** 3 boon cards.
- **Pause:**
  - Resume, Settings, Quit to title
  - A stats panel with every stat
  - The inventory: weapons, tomes and items with tooltips
- **Game over / victory:**
  - Character, stage reached, time, level, kills (elite and boss), gold,
    silver earned
  - Damage by weapon as a bar list, and the inventory
  - Retry / Title
- **Stage clear:** "STAGE CLEARED", a summary and a Continue button.
