/**
 * The contract every system in Bonkrush is written against.
 *
 * Systems never import each other's classes directly; they reach each other
 * through `GameContext`, typed by the interfaces below. That keeps each
 * folder replaceable and lets the pure logic be tested without a renderer.
 *
 * World units are metres. Y is up. The player is about 1.8 m tall.
 */
import type * as THREE from 'three'
import type { EventBus } from '../core/events'
import type { Rng } from '../core/rng'

export type Vec3 = THREE.Vector3

// ─────────────────────────────── Stats ───────────────────────────────

/**
 * Every stat the player has. Weapons read the offensive ones; the player,
 * pickups and spawner read the rest. See `progression/stats.ts` for base
 * values, stacking and caps.
 */
export type StatId =
  // Survival
  | 'maxHp' // flat HP
  | 'regen' // HP per second
  | 'overheal' // fraction of healing past max HP that becomes shield
  | 'shield' // flat shield points; recharges after 4 s without damage
  | 'armor' // damage reduction fraction, 0..0.8
  | 'evasion' // chance to dodge a hit, 0..0.75
  | 'lifesteal' // fraction of damage dealt that heals, chance-based per hit
  | 'thorns' // flat damage dealt back to melee attackers
  // Offence
  | 'damage' // multiplier, base 1
  | 'critChance' // 0..1+ (over 1 rolls "overcrits" for extra multiplier)
  | 'critDamage' // multiplier applied on crit, base 2
  | 'attackSpeed' // cooldown divisor, base 1
  | 'projectiles' // extra projectiles / instances added to every weapon
  | 'bounces' // extra bounces / chains added to bouncing weapons
  | 'size' // area / projectile scale multiplier
  | 'projectileSpeed' // multiplier
  | 'duration' // multiplier for lingering effects
  | 'eliteDamage' // multiplier vs elites and bosses
  | 'knockback' // multiplier
  // Movement
  | 'moveSpeed' // multiplier on base run speed
  | 'extraJumps' // additional mid-air jumps
  | 'jumpHeight' // multiplier
  // Economy / run
  | 'luck' // shifts rarity rolls and proc chances; 0 = neutral
  | 'difficulty' // extra enemy count / hp / reward, 0 = neutral (0.25 = +25%)
  | 'pickupRange' // multiplier on base magnet radius
  | 'xpGain' // multiplier
  | 'goldGain' // multiplier
  | 'silverGain' // multiplier

export interface StatMod {
  stat: StatId
  /** 'add' adds to the base (damage +0.1 = +10%); 'mul' multiplies the total. */
  op: 'add' | 'mul'
  value: number
}

export type StatBlock = Record<StatId, number>

// ─────────────────────────────── Rarity ──────────────────────────────

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

// ─────────────────────────────── Content ─────────────────────────────

/** What a weapon's per-instance numbers are. Player stats scale these. */
export interface WeaponStats {
  damage: number
  /** Seconds between activations before attack speed. */
  cooldown: number
  /** Projectiles / instances per activation before the player's bonus. */
  count: number
  /** Area or projectile scale in metres (meaning is per weapon). */
  size: number
  /** Projectile speed m/s (0 for non-projectile weapons). */
  speed: number
  /** Lifetime of spawned effects, seconds. */
  duration: number
  /** Enemies a projectile passes through before it is spent (Infinity allowed). */
  pierce: number
  /** Bounces / chain jumps. */
  bounces: number
  /** Targeting / reach radius in metres. */
  range: number
  knockback: number
  /** Added to the player's crit chance for this weapon. */
  critChance: number
}

export type WeaponStatKey = keyof WeaponStats

export interface WeaponDef {
  id: string
  name: string
  /** One emoji or short glyph, shown on cards and the HUD. */
  icon: string
  /** Hex colour used for its VFX and card accent. */
  color: string
  description: string
  /** Key into the behavior registry in `weapons/`. */
  behavior: string
  base: WeaponStats
  /** Stats a level-up can raise, with the common-rarity step for each. */
  upgrades: Partial<Record<WeaponStatKey, number>>
  /** Hidden until unlocked via meta progression. */
  locked?: boolean
}

export interface TomeDef {
  id: string
  name: string
  icon: string
  description: string
  /** Mods granted per level at common rarity; rarity multiplies `value`. */
  perLevel: StatMod[]
  locked?: boolean
}

/** Hooks an item can react to. All are optional. `stacks` is how many the player holds. */
export interface ItemHooks {
  onKill?(ctx: GameContext, enemy: Enemy, stacks: number): void
  onHit?(ctx: GameContext, enemy: Enemy, damage: number, crit: boolean, stacks: number): void
  onPlayerDamaged?(ctx: GameContext, amount: number, stacks: number): void
  onJump?(ctx: GameContext, stacks: number): void
  onLevelUp?(ctx: GameContext, stacks: number): void
  onChestOpened?(ctx: GameContext, stacks: number): void
  /** Called every frame while held. */
  update?(ctx: GameContext, dt: number, stacks: number): void
}

export interface ItemDef {
  id: string
  name: string
  icon: string
  rarity: Rarity
  description: string
  /** Stat mods per stack. */
  mods?: StatMod[]
  hooks?: ItemHooks
  locked?: boolean
}

export interface CharacterDef {
  id: string
  name: string
  icon: string
  description: string
  /** Weapon id the run starts with. */
  startWeapon: string
  /** Passive, as mods on the base stats. */
  passive: StatMod[]
  passiveText: string
  /** Body colours for the procedural model. */
  colors: { body: string; accent: string; detail: string }
  /** Model silhouette preset; see `player/PlayerModel.ts`. */
  model: 'knight' | 'skeleton' | 'fox' | 'robot' | 'ninja' | 'monkey' | 'wizard' | 'ogre'
  /** Silver to unlock; 0 = unlocked from the start. */
  unlockCost: number
}

export type EnemyBehavior =
  | 'chaser' // walks straight at the player
  | 'swarmer' // fast, weak, flanks
  | 'flier' // hovers above ground, ignores terrain height for pathing
  | 'ranged' // keeps distance and fires projectiles
  | 'charger' // winds up then dashes
  | 'exploder' // runs in and blows up
  | 'tank' // slow, heavy, big
  | 'boss'

export interface EnemyDef {
  id: string
  name: string
  behavior: EnemyBehavior
  hp: number
  /** Contact / attack damage. */
  damage: number
  /** Move speed m/s. */
  speed: number
  /** Collision radius m. */
  radius: number
  /** Visual height m. */
  height: number
  xp: number
  /** Chance to drop gold on death (0..1) and amount range. */
  gold: { chance: number; min: number; max: number }
  color: string
  accent: string
  /** Mesh preset; see `enemies/EnemyModels.ts`. */
  model: string
  /** Knockback resistance 0..1. */
  weight: number
  /** For 'ranged' and bosses. */
  projectile?: { damage: number; speed: number; cooldown: number; range: number; color: string }
}

// ─────────────────────────────── Entities ────────────────────────────

export interface Enemy {
  /** Unique for the run; never reused. */
  readonly uid: number
  def: EnemyDef
  pos: Vec3
  vel: Vec3
  /** Facing yaw in radians. */
  yaw: number
  hp: number
  maxHp: number
  /** Scale on the def's radius/height (elites and bosses are bigger). */
  scale: number
  elite: boolean
  boss: boolean
  alive: boolean
  /** Seconds of remaining status effects. */
  slow: number
  burn: number
  burnDps: number
  freeze: number
  /** Seconds since last hit, for the white flash. */
  hitFlash: number
  /** Free per-behavior timers/state. */
  t: number
  state: number
}

export interface DamageOptions {
  /** Weapon id or 'thorns' / 'item:<id>' / 'shrine' etc. For stats & items. */
  source: string
  crit?: boolean
  /** Horizontal push, metres/second applied to velocity. */
  knockback?: Vec3
  /** Skip item onHit hooks (for damage that items themselves deal). */
  noProcs?: boolean
}

/** Result of rolling a weapon's damage against the player's stats. */
export interface DamageRoll {
  amount: number
  crit: boolean
}

export type PickupKind = 'xp' | 'gold' | 'silver' | 'health' | 'magnet' | 'bomb' | 'chestKey'

// ─────────────────────────────── Systems ─────────────────────────────

export interface WorldApi {
  /** Half the side of the square play area; the map spans [-halfSize, halfSize]. */
  readonly halfSize: number
  /** Ground height at (x, z). Cheap enough to call per entity per frame. */
  heightAt(x: number, z: number): number
  /** Unit normal of the ground at (x, z), written into `out`. */
  normalAt(x: number, z: number, out: Vec3): Vec3
  /** Pushes a circle at (pos.x, pos.z) with `radius` out of solid props and the boundary. Mutates pos. */
  collide(pos: Vec3, radius: number): void
  /** Deterministic spots the interactables system uses to place things. */
  readonly spots: {
    chests: Vec3[]
    shrines: Vec3[]
    pots: Vec3[]
    altar: Vec3
    playerStart: Vec3
  }
  update(dt: number): void
  dispose(): void
}

export interface PlayerApi {
  readonly pos: Vec3
  readonly vel: Vec3
  /** Yaw the body faces (radians, 0 = -Z). */
  readonly yaw: number
  readonly radius: number
  readonly onGround: boolean
  readonly sliding: boolean
  hp: number
  shield: number
  readonly alive: boolean
  /** Deals damage to the player through armor, evasion, shield and i-frames. Returns damage taken. */
  hurt(amount: number, source: string, from?: Vec3): number
  heal(amount: number): void
  /** Called when the character or stats change so the model/colliders refresh. */
  refresh(): void
  update(dt: number): void
  dispose(): void
}

export interface EnemyApi {
  /** Live enemies; do not mutate the array. */
  readonly list: readonly Enemy[]
  readonly aliveCount: number
  readonly boss: Enemy | null
  spawn(defId: string, pos: Vec3, opts?: { elite?: boolean; boss?: boolean; hpScale?: number }): Enemy | null
  /** Fills `out` with living enemies within `radius` of `center` (XZ distance plus height check). */
  queryRadius(center: Vec3, radius: number, out: Enemy[]): Enemy[]
  nearest(pos: Vec3, maxDist: number, exclude?: ReadonlySet<number>): Enemy | null
  /** Applies damage, flash, damage number, knockback; kills and emits events. */
  damage(enemy: Enemy, amount: number, opts: DamageOptions): void
  /** Status effects. */
  applySlow(enemy: Enemy, seconds: number): void
  applyBurn(enemy: Enemy, dps: number, seconds: number): void
  applyFreeze(enemy: Enemy, seconds: number): void
  /** Removes every non-boss enemy (stage transitions). */
  clear(includeBoss?: boolean): void
  update(dt: number): void
  dispose(): void
}

/** Wave director: decides what spawns, when and where. */
export interface SpawnerApi {
  /** 0..1 intensity for music/UI. */
  readonly intensity: number
  readonly finalSwarm: boolean
  /** Spawns a ring of elites around `center` (challenge shrine); returns them so the shrine can track the fight. */
  spawnChallenge(count: number, center: Vec3): Enemy[]
  summonBoss(): void
  update(dt: number): void
  reset(): void
}

export interface WeaponInstance {
  def: WeaponDef
  level: number
  /** def.base plus every upgrade taken. */
  stats: WeaponStats
  /** Counts down to the next activation. */
  timer: number
  /** Damage dealt this run, for the end screen. */
  dealt: number
  kills: number
}

export interface WeaponApi {
  readonly owned: readonly WeaponInstance[]
  readonly maxSlots: number
  add(defId: string): WeaponInstance | null
  has(defId: string): boolean
  /** Applies an upgrade (from the offer generator) to an owned weapon. */
  upgrade(defId: string, changes: Partial<WeaponStats>): void
  /**
   * The weapon's effective numbers after the player's stats: damage × damage stat,
   * cooldown ÷ attack speed, count + projectiles, size × size, etc.
   */
  effective(w: WeaponInstance): WeaponStats
  /** Rolls crit & multipliers for one hit of `w` against `enemy`. */
  rollDamage(w: WeaponInstance, enemy: Enemy): DamageRoll
  update(dt: number): void
  dispose(): void
}

export interface PickupApi {
  spawn(kind: PickupKind, pos: Vec3, value: number): void
  /** Pulls every xp/gold pickup on the map to the player (magnet). */
  magnetAll(): void
  readonly count: number
  clear(): void
  update(dt: number): void
  dispose(): void
}

export type InteractableKind =
  | 'chest'
  | 'pot'
  | 'shrineCharge'
  | 'shrineGreed'
  | 'shrineMagnet'
  | 'shrineChallenge'
  | 'shrineCurse'
  | 'altar'
  | 'portal'

export interface InteractableApi {
  /** The thing in reach the player could use with Interact, with its prompt text. */
  readonly prompt: { text: string; cost?: number } | null
  /** Called when the player presses Interact. */
  interact(): void
  /** Shows the exit portal (after the boss dies). */
  openPortal(pos: Vec3): void
  /** Breaks pots / damages breakables in radius (weapons call this). */
  hitBreakables(center: Vec3, radius: number): void
  /** Current gold price of the next paid chest. */
  readonly chestCost: number
  /** Drops a chest on the ground (elite / miniboss / boss / challenge rewards). */
  spawnChest(pos: Vec3, free: boolean): void
  /** Everything the minimap draws. */
  readonly markers: ReadonlyArray<{ kind: InteractableKind; pos: Vec3; used: boolean; golden?: boolean }>
  reset(): void
  update(dt: number): void
  dispose(): void
}

export interface FxApi {
  /** A burst of low-poly particles. */
  burst(pos: Vec3, color: string, count: number, speed?: number, size?: number): void
  /** A floating damage / text number at a world position. */
  number(pos: Vec3, text: string, kind: 'damage' | 'crit' | 'heal' | 'player' | 'gold' | 'xp' | 'info'): void
  /** Expanding ring on the ground (explosions, shockwaves, shrine charge). */
  ring(pos: Vec3, radius: number, color: string, duration?: number): void
  /** Camera shake, 0..1 strength. */
  shake(strength: number): void
  /** Current shake displacement; the camera adds it every frame. Zero when shake is off in settings. */
  readonly shakeOffset: Vec3
  /** Brief full-screen tint (e.g. red on damage). */
  flash(color: string, strength: number): void
  update(dt: number): void
  clear(): void
  dispose(): void
}

export type SfxId =
  | 'bonk' // enemy hit
  | 'crit'
  | 'kill'
  | 'shoot'
  | 'swing'
  | 'zap'
  | 'fire'
  | 'explode'
  | 'xp'
  | 'gold'
  | 'heal'
  | 'levelUp'
  | 'chest'
  | 'rarity' // chest reveal sting; pitch by rarity
  | 'hurt'
  | 'jump'
  | 'land'
  | 'slide'
  | 'shrine'
  | 'bossRoar'
  | 'portal'
  | 'uiMove'
  | 'uiSelect'
  | 'death'
  | 'victory'

export interface AudioApi {
  /** Starts audio after a user gesture (browsers require it). */
  unlock(): void
  play(id: SfxId, opts?: { volume?: number; pitch?: number; pos?: Vec3 }): void
  /** 0 = calm, 1 = final swarm. */
  setIntensity(level: number): void
  /** Stage song by index; -1 is the calmer title theme. */
  startMusic(stageIndex: number): void
  stopMusic(): void
  setVolumes(master: number, music: number, sfx: number): void
  update(dt: number): void
}

export interface InputState {
  /** Movement intent in camera space: x = right, y = forward, length <= 1. */
  move: { x: number; y: number }
  /** Look delta this frame in radians (already scaled by sensitivity). */
  look: { yaw: number; pitch: number }
  jumpPressed: boolean
  jumpHeld: boolean
  slideHeld: boolean
  interactPressed: boolean
  pausePressed: boolean
  /** Tab held: the UI shows the big map and stats. */
  tabHeld: boolean
}

export interface InputApi {
  readonly state: InputState
  readonly isTouch: boolean
  /** Whether pointer lock / look control is active (desktop). */
  readonly looking: boolean
  requestLook(): void
  releaseLook(): void
  /** Clears one-frame flags; called at the end of each frame. */
  endFrame(): void
  /** Look sensitivity multiplier (1 = default) and inverted vertical look. */
  configure(sensitivity: number, invertY: boolean): void
  setTouchControlsVisible(visible: boolean): void
  dispose(): void
}

export interface CameraApi {
  readonly camera: THREE.PerspectiveCamera
  /** Camera yaw, radians. Movement is relative to this. */
  readonly yaw: number
  readonly pitch: number
  update(dt: number): void
  /** Snap behind the player (stage start). */
  snap(): void
}

/** A card offered on level-up, from a shrine, or out of a chest. */
export type Offer =
  | { type: 'newWeapon'; id: string; rarity: Rarity }
  | { type: 'weaponUpgrade'; id: string; rarity: Rarity; changes: Partial<WeaponStats> }
  | { type: 'newTome'; id: string; rarity: Rarity }
  | { type: 'tomeUpgrade'; id: string; rarity: Rarity }
  | { type: 'stat'; rarity: Rarity; mods: StatMod[]; label: string }
  | { type: 'item'; id: string; rarity: Rarity }
  | { type: 'gold'; amount: number; rarity: Rarity }
  | { type: 'heal'; amount: number; rarity: Rarity }

export interface TomeInstance {
  def: TomeDef
  level: number
  /** Mods accumulated so far (rarity-scaled per level taken). */
  mods: StatMod[]
}

export interface ProgressionApi {
  /**
   * Final player stats: base + character + tomes + items + shrines, capped.
   * `difficulty` already includes run.curse + run.greed; nobody else adds them.
   */
  readonly stats: Readonly<StatBlock>
  readonly tomes: readonly TomeInstance[]
  readonly maxTomes: number
  /** item id → stacks held. */
  readonly items: ReadonlyMap<string, number>
  readonly level: number
  readonly xp: number
  readonly xpToNext: number
  /** Level-ups waiting for the player to pick. */
  readonly pendingLevelUps: number
  readonly rerolls: number
  readonly skips: number
  readonly banishes: number
  addXp(amount: number): void
  /** Three (or more with luck) level-up offers. */
  rollLevelUpOffers(): Offer[]
  /** Offers for a charge shrine: stat boons (all legendary from a golden shrine). */
  rollShrineOffers(golden?: boolean): Offer[]
  /** One item out of a chest, rarity rolled with luck. */
  rollChestItem(): Offer
  applyOffer(offer: Offer): void
  /** Consumes one pending level-up without taking anything. */
  skipLevelUp(): void
  /** Uses a reroll charge; returns false if none left. */
  useReroll(): boolean
  /**
   * Uses a banish charge; the offer's id never appears again this run. It
   * does not use up the level-up: the UI rolls fresh cards for the same level.
   */
  banish(offer: Offer): boolean
  addItem(id: string, count?: number): void
  /**
   * Multiplier from conditional item effects on a hit against `enemy`
   * (Tactical Glasses, Sky Scarf, Brass Knuckles, Idle Juice, Beefy Ring,
   * Phantom Shroud buff…). Weapons fold it into every hit.
   */
  outgoingMultiplier(enemy: Enemy): number
  /** Asked by the player on lethal damage; true if an item saved them (Stopwatch). */
  tryCheatDeath(): boolean
  addMods(mods: StatMod[], source: string): void
  /** Recomputes `stats` (call after any change); cheap. */
  recompute(): void
  update(dt: number): void
  /** Frees item effect visuals at the end of a run. */
  dispose(): void
}

/** Numbers for the HUD and the end screen. */
export interface RunState {
  seed: number
  characterId: string
  stageIndex: number
  /** Seconds since the stage began (pauses excluded). */
  stageTime: number
  /** Seconds since the run began. */
  totalTime: number
  /** Stage length before the final swarm, seconds. */
  stageDuration: number
  kills: number
  gold: number
  silver: number
  damageDealt: number
  damageTaken: number
  chestsOpened: number
  shrinesUsed: number
  bossesKilled: number
  elitesKilled: number
  bossSpawned: boolean
  bossDefeated: boolean
  portalOpen: boolean
  /** Extra difficulty from curse shrines this stage; reset every stage. */
  curse: number
  /** Extra difficulty from greed shrines; lasts the whole run. */
  greed: number
  /** Paid chests opened this run; the chest price climbs with it across stages. */
  chestsPaid: number
}

export interface GameEvents {
  /** `procs` is false for damage that must not trigger on-hit items (burns, item effects). */
  enemyHit: { enemy: Enemy; amount: number; crit: boolean; source: string; procs: boolean }
  enemyKilled: { enemy: Enemy; source: string }
  playerDamaged: { amount: number; source: string }
  playerHealed: { amount: number }
  playerDied: Record<string, never>
  playerDodged: Record<string, never>
  playerJumped: { airJump: boolean }
  playerLanded: { speed: number }
  playerSlid: Record<string, never>
  xpGained: { amount: number }
  levelUp: { level: number }
  goldChanged: { gold: number; delta: number }
  pickup: { kind: PickupKind; value: number }
  chestOpened: { offer: Offer; free: boolean }
  shrineUsed: { kind: InteractableKind }
  bossSpawned: { enemy: Enemy }
  bossKilled: { enemy: Enemy }
  finalSwarm: Record<string, never>
  portalOpened: { pos: Vec3 }
  stageCleared: { stageIndex: number }
  weaponAdded: { id: string }
  itemAdded: { id: string; stacks: number }
  statsChanged: Record<string, never>
  /** A themed burst (every 60 s) or an encirclement (a ring closing in around the player). */
  wave: { defId: string; count: number; encircle: boolean }
}

/** Modal requests the UI must show; the game is paused while one is open. */
export type ModalRequest =
  | { kind: 'levelUp' }
  | { kind: 'chest'; offer: Offer }
  | { kind: 'shrine'; offers: Offer[] }
  | { kind: 'pause' }
  | { kind: 'gameOver' }
  | { kind: 'victory' }
  | { kind: 'stageClear'; nextStage: number }

export interface UiApi {
  /** Binds the HUD and event listeners to a run (or unbinds with null). */
  attach(ctx: GameContext | null): void
  /** Shows the title screen (with character select, unlocks and settings). */
  showTitle(): void
  /** Opens a modal; resolves when the player closes it. The game pauses meanwhile. */
  openModal(req: ModalRequest): Promise<void>
  readonly modalOpen: boolean
  /** Whether any menu or modal owns the screen (title included). */
  readonly menuOpen: boolean
  /**
   * Test/bot mode: every modal picks its first sensible option by itself
   * after a short delay, so a headless browser can play a run unattended.
   */
  autoPick: boolean
  /** Big centred banner (e.g. "FINAL SWARM", "BOSS INCOMING"). */
  banner(text: string, sub?: string, color?: string): void
  /** Small toast (e.g. "+ Clover"). */
  toast(text: string, color?: string): void
  update(dt: number): void
  dispose(): void
}

/** What the UI can ask of the game shell outside of a run. */
export interface ShellApi {
  readonly meta: MetaSave
  readonly input: InputApi
  /**
   * A PNG data URL of the character's 3D model, rendered with the game's
   * renderer (for character select). Empty string if rendering failed.
   */
  renderPortrait(characterId: string, size: number): string
  /** The current run, or null on the title screen. */
  readonly ctx: GameContext | null
  readonly characters: readonly CharacterDef[]
  startRun(characterId: string): void
  /** Ends any run and returns to the title screen. */
  quitToTitle(): void
  /** Spends silver on a character; false if locked out or too poor. */
  unlockCharacter(id: string): boolean
  isUnlocked(characterId: string): boolean
  /** Persists meta + settings and applies settings (volume, quality, sensitivity). */
  saveMeta(): void
}

export interface Settings {
  master: number
  music: number
  sfx: number
  sensitivity: number
  invertY: boolean
  /** 'low' | 'medium' | 'high' — shadows, pixel ratio, draw distance. */
  quality: 'low' | 'medium' | 'high'
  showDamageNumbers: boolean
  screenShake: boolean
}

export interface MetaSave {
  silver: number
  unlockedCharacters: string[]
  bestTime: number
  bestKills: number
  bestStage: number
  runs: number
  settings: Settings
}

/**
 * Everything a system can reach. Built once per run by `Game`; fields are
 * assigned in dependency order before any `update` runs, so systems may
 * read any of them from their own `update`.
 */
export interface GameContext {
  readonly scene: THREE.Scene
  readonly renderer: THREE.WebGLRenderer
  readonly rng: Rng
  readonly events: EventBus<GameEvents>
  readonly run: RunState
  readonly meta: MetaSave
  readonly settings: Settings
  readonly character: CharacterDef
  /** Current stage definition (see `data/stages.ts`); replaced on stage change. */
  readonly stage: StageDef
  world: WorldApi
  player: PlayerApi
  camera: CameraApi
  input: InputApi
  enemies: EnemyApi
  spawner: SpawnerApi
  weapons: WeaponApi
  pickups: PickupApi
  interactables: InteractableApi
  progression: ProgressionApi
  fx: FxApi
  audio: AudioApi
  ui: UiApi
  /** Adds (or removes, if negative) gold with goldGain applied to positive amounts; emits goldChanged. */
  addGold(amount: number, raw?: boolean): void
  /** Game-time seconds (pauses excluded); handy for animation. */
  readonly time: number
  /** The interactables system calls this when the player steps into the exit portal. */
  advanceStage(): void
}

export interface StageDef {
  index: number
  name: string
  subtitle: string
  /** Seconds before the final swarm. */
  duration: number
  palette: {
    sky: string
    fog: string
    fogNear: number
    fogFar: number
    groundLow: string
    groundHigh: string
    cliff: string
    sun: string
    sunIntensity: number
    ambient: string
    ambientIntensity: number
    accent: string
  }
  terrain: { amplitude: number; frequency: number; octaves: number; seed: number; plateau: number }
  /** Prop presets the world scatters; see `world/props.ts`. */
  props: Array<{ kind: string; count: number; solid: boolean }>
  /** Enemy ids that appear on this stage, in rough order of appearance. */
  roster: string[]
  bossId: string
  /** Multiplier on enemy hp/damage for this stage. */
  enemyScale: number
}
