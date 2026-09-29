/**
 * The run's build: level and XP, tomes, items, shrine boons and the final
 * stat block every other system reads. Created before the world, so the
 * constructor touches only run-wide context; weapons and the player are
 * looked up when needed.
 */
import type { Rng } from '../core/rng'
import type {
  Enemy,
  GameContext,
  GameEvents,
  ItemHooks,
  Offer,
  ProgressionApi,
  Rarity,
  StatBlock,
  StatMod,
  TomeDef,
  TomeInstance,
} from '../game/types'
import { WEAPONS } from '../weapons/weaponDefs'
import { ITEM_BY_ID, ITEMS } from './itemDefs'
import { BIG_BONK_CHANCE, BIG_BONK_MULT, itemRuntime, type ItemRuntime } from './itemEffects'
import {
  conditionalMultiplier,
  lifestealHeal,
  mergeMod,
  procChance,
  stackMods,
  type ConditionalStacks,
  type HitConditions,
} from './itemMath'
import {
  banishKey,
  rollChestItem as rollChest,
  rollLevelUpOffers as rollLevelUp,
  rollShrineOffers as rollShrine,
} from './offers'
import { RARITY_COLOR, RARITY_MULT } from './rarity'
import { computeStats, describeMod, scaleMod } from './stats'
import { CHAOS_TOME, rollChaosMod, TOME_BY_ID, TOMES, tomeMaxLevel } from './tomeDefs'
import { gainXp, xpToNext } from './xp'

const MAX_TOMES = 4
/** Weapon slots to assume before the weapon system exists. */
const DEFAULT_WEAPON_SLOTS = 4
/** Share of the skipped level's XP paid back as gold. */
const SKIP_GOLD = 0.2
/** Chance per Wrench that a shrine boon rolls one rarity higher (stacks like independent rolls). */
const WRENCH_BUMP = 0.25

type HeldItem = { hooks: ItemHooks; stacks: number }

const LEVEL_UP_TYPES: ReadonlySet<Offer['type']> = new Set<Offer['type']>([
  'newWeapon',
  'weaponUpgrade',
  'newTome',
  'tomeUpgrade',
  'gold',
  'heal',
])

export class Progression implements ProgressionApi {
  stats: StatBlock
  readonly tomes: TomeInstance[] = []
  readonly maxTomes = MAX_TOMES
  readonly items = new Map<string, number>()
  level = 1
  xp = 0
  xpToNext = xpToNext(1)
  pendingLevelUps = 0
  rerolls = 3
  skips = 3
  banishes = 2

  private readonly banished = new Set<string>()
  /** Shrine boons and anything else granted straight onto the stats. */
  private readonly extraMods: StatMod[] = []
  /** Offer rolls; forked so combat procs never shift what a level-up offers. */
  private readonly offerRng: Rng
  private readonly runtime: ItemRuntime
  private readonly unsubs: Array<() => void> = []
  /** Held items that have hooks, rebuilt when an item is added. */
  private readonly held: HeldItem[] = []
  private readonly conditional: ConditionalStacks = { glasses: 0, scarf: 0, knuckles: 0, idle: 0, beefy: 0, shroud: 0 }
  private anyConditional = false
  private bonkStacks = 0
  private readonly hit: HitConditions = {
    enemyHpFrac: 1,
    airborne: false,
    distance: 0,
    stillSeconds: 0,
    maxHp: 0,
    shroudActive: false,
  }
  /** Chest stand-ins that must not use up a pending level-up when taken. */
  private readonly nonLevelOffers = new WeakSet<Offer>()
  /** The shrine difficulty last folded into `stats`, to notice when a shrine changes it. */
  private appliedCurse: number
  private appliedGreed: number

  constructor(private readonly ctx: GameContext) {
    this.offerRng = ctx.rng.fork(0x0ffe5)
    this.runtime = itemRuntime(ctx)
    this.appliedCurse = ctx.run.curse
    this.appliedGreed = ctx.run.greed
    this.stats = computeStats(this.collectMods())

    const on = <K extends keyof GameEvents>(type: K, fn: (p: GameEvents[K]) => void) =>
      this.unsubs.push(ctx.events.on(type, fn))

    on('enemyHit', this.onEnemyHit)
    on('enemyKilled', ({ enemy, source }) => {
      for (let i = 0; i < this.held.length; i++) this.held[i].hooks.onKill?.(ctx, enemy, this.held[i].stacks, source)
    })
    on('playerDamaged', ({ amount }) => {
      for (let i = 0; i < this.held.length; i++) this.held[i].hooks.onPlayerDamaged?.(ctx, amount, this.held[i].stacks)
    })
    on('playerJumped', () => {
      for (let i = 0; i < this.held.length; i++) this.held[i].hooks.onJump?.(ctx, this.held[i].stacks)
    })
    on('levelUp', () => {
      for (let i = 0; i < this.held.length; i++) this.held[i].hooks.onLevelUp?.(ctx, this.held[i].stacks)
    })
    on('chestOpened', () => {
      for (let i = 0; i < this.held.length; i++) this.held[i].hooks.onChestOpened?.(ctx, this.held[i].stacks)
    })
    on('playerDodged', () => this.runtime.onDodge(this.stacks('phantom_shroud')))
    on('stageCleared', () => this.runtime.resetStage())
  }

  // ───────────────────────────── stats ─────────────────────────────

  recompute(): void {
    this.appliedCurse = this.ctx.run.curse
    this.appliedGreed = this.ctx.run.greed
    this.stats = computeStats(this.collectMods())
    this.ctx.events.emit('statsChanged', {})
    // The player doesn't exist yet while the run is being built.
    this.ctx.player?.refresh()
  }

  addMods(mods: StatMod[], _source: string): void {
    for (const m of mods) this.extraMods.push({ ...m })
    this.recompute()
  }

  stacks(id: string): number {
    return this.items.get(id) ?? 0
  }

  // ───────────────────────────── xp ─────────────────────────────

  addXp(amount: number): void {
    if (!(amount > 0)) return
    const gained = amount * this.stats.xpGain
    const r = gainXp(this.level, this.xp, gained)
    this.xp = r.xp
    this.ctx.events.emit('xpGained', { amount: gained })
    for (let i = 0; i < r.levelsGained; i++) {
      this.level++
      this.xpToNext = xpToNext(this.level)
      this.pendingLevelUps++
      this.ctx.events.emit('levelUp', { level: this.level })
    }
    if (r.levelsGained > 0) this.ctx.audio.play('levelUp')
  }

  // ───────────────────────────── offers ─────────────────────────────

  rollLevelUpOffers(): Offer[] {
    const weapons = this.ctx.weapons
    return rollLevelUp(
      {
        weaponPool: WEAPONS,
        tomePool: TOMES,
        weapons: weapons?.owned ?? [],
        maxWeapons: weapons?.maxSlots ?? DEFAULT_WEAPON_SLOTS,
        tomes: this.tomes,
        maxTomes: this.maxTomes,
        maxed: this.maxedTomes(TOMES),
        banished: this.banished,
        luck: this.stats.luck,
        anvil: this.stacks('anvil') > 0,
        level: this.level,
        maxHp: this.stats.maxHp,
      },
      this.offerRng,
    )
  }

  /**
   * Charge shrine boons. `golden` makes all three legendary; the optional
   * parameter keeps this assignable to `ProgressionApi.rollShrineOffers()`.
   */
  rollShrineOffers(golden = false): Offer[] {
    const wrench = this.stacks('wrench')
    return rollShrine(
      {
        tomePool: TOMES,
        maxed: this.maxedTomes(TOMES),
        banished: this.banished,
        luck: this.stats.luck,
        forceRarity: golden ? 'legendary' : undefined,
        bumpChance: wrench > 0 ? 1 - Math.pow(1 - WRENCH_BUMP, wrench) : 0,
      },
      this.offerRng,
    )
  }

  rollChestItem(): Offer {
    const offer = rollChest({ itemPool: ITEMS, banished: this.banished, luck: this.stats.luck }, this.offerRng)
    if (offer) return offer
    // Only reachable if every item were banished; pay out instead of an empty chest.
    const gold: Offer = { type: 'gold', amount: 30, rarity: 'common' }
    this.nonLevelOffers.add(gold)
    return gold
  }

  applyOffer(offer: Offer): void {
    switch (offer.type) {
      case 'newWeapon':
        this.ctx.weapons?.add(offer.id)
        break
      case 'weaponUpgrade':
        this.ctx.weapons?.upgrade(offer.id, offer.changes)
        break
      case 'newTome':
      case 'tomeUpgrade':
        this.addTomeLevel(offer.id, offer.rarity)
        break
      case 'stat':
        this.addMods(offer.mods, 'shrine')
        break
      case 'item':
        this.addItem(offer.id)
        break
      case 'gold':
        this.ctx.addGold(offer.amount)
        break
      case 'heal':
        this.ctx.player?.heal(offer.amount)
        break
    }
    if (LEVEL_UP_TYPES.has(offer.type) && !this.nonLevelOffers.has(offer)) this.consumeLevelUp()
  }

  /**
   * Skips a pending level-up. With a skip charge it pays 20% of that level's
   * XP as gold; without one it still closes the level-up (for nothing), so a
   * UI can never get stuck on a level-up it can't resolve.
   */
  skipLevelUp(): void {
    if (this.pendingLevelUps <= 0) return
    const reached = this.level - this.pendingLevelUps + 1
    this.consumeLevelUp()
    if (this.skips <= 0) return
    this.skips--
    this.ctx.addGold(Math.max(1, Math.round(xpToNext(Math.max(1, reached - 1)) * SKIP_GOLD)))
  }

  useReroll(): boolean {
    if (this.rerolls <= 0) return false
    this.rerolls--
    return true
  }

  /**
   * Removes the offer's weapon, tome or item from every future roll. The
   * level-up stays pending: the UI rolls fresh cards for the same level.
   */
  banish(offer: Offer): boolean {
    const key = banishKey(offer)
    if (!key || this.banishes <= 0) return false
    this.banishes--
    this.banished.add(key)
    return true
  }

  // ───────────────────────────── tomes & items ─────────────────────────────

  addItem(id: string, count = 1): void {
    const def = ITEM_BY_ID.get(id)
    const n = Math.floor(count)
    if (!def || !(n > 0)) return
    const stacks = this.stacks(id) + n
    this.items.set(id, stacks)
    this.rebuildHeld()
    this.recompute()
    this.ctx.events.emit('itemAdded', { id, stacks })
    this.ctx.ui?.toast(`+ ${def.name}`, RARITY_COLOR[def.rarity])
  }

  private addTomeLevel(id: string, rarity: Rarity): void {
    const def = TOME_BY_ID.get(id)
    if (!def) return
    let tome = this.tomes.find((t) => t.def.id === id)
    if (!tome) {
      if (this.tomes.length >= this.maxTomes) return
      tome = { def, level: 0, mods: [] }
      this.tomes.push(tome)
    }
    if (tome.level >= tomeMaxLevel(id)) return
    const mult = RARITY_MULT[rarity]
    if (def.id === CHAOS_TOME) {
      const step = scaleMod(rollChaosMod(this.offerRng), mult)
      mergeMod(tome.mods, step)
      this.ctx.ui?.toast(`${def.icon} ${describeMod(step)}`, RARITY_COLOR[rarity])
    } else {
      for (const m of def.perLevel) mergeMod(tome.mods, scaleMod(m, mult))
    }
    tome.level++
    this.recompute()
  }

  private consumeLevelUp(): void {
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1)
  }

  private collectMods(): StatMod[] {
    const mods: StatMod[] = [...this.ctx.character.passive]
    for (const t of this.tomes) mods.push(...t.mods)
    for (const [id, n] of this.items) {
      const def = ITEM_BY_ID.get(id)
      if (def?.mods) mods.push(...stackMods(def.mods, n))
    }
    mods.push(...this.extraMods, ...this.runtime.buffMods)
    // Curse (this stage) and greed (this run) shrines raise the run numbers
    // directly; this is the one place they land on the difficulty stat.
    const shrine = (this.ctx.run.curse || 0) + (this.ctx.run.greed || 0)
    if (shrine) mods.push({ stat: 'difficulty', op: 'add', value: shrine })
    return mods
  }

  /**
   * Tomes whose next level would change nothing because every stat they
   * raise is at its cap (Blood past max lifesteal, Evasion at 75%...), so
   * no card offers a dead upgrade. Chaos rolls a random stat and never is.
   */
  private maxedTomes(pool: readonly TomeDef[]): Set<string> {
    const out = new Set<string>()
    const candidates = pool.filter((d) => d.id !== CHAOS_TOME && d.perLevel.length > 0)
    if (candidates.length === 0) return out
    const mods = this.collectMods()
    const now = computeStats(mods)
    for (const def of candidates) {
      const next = computeStats([...mods, ...def.perLevel])
      if (def.perLevel.every((m) => next[m.stat] === now[m.stat])) out.add(def.id)
    }
    return out
  }

  private rebuildHeld(): void {
    this.held.length = 0
    for (const [id, stacks] of this.items) {
      const hooks = ITEM_BY_ID.get(id)?.hooks
      if (hooks) this.held.push({ hooks, stacks })
    }
    const c = this.conditional
    c.glasses = this.stacks('tactical_glasses')
    c.scarf = this.stacks('scarf')
    c.knuckles = this.stacks('brass_knuckles')
    c.idle = this.stacks('idle_juice')
    c.beefy = this.stacks('beefy_ring')
    c.shroud = this.stacks('phantom_shroud')
    this.anyConditional = c.glasses + c.scarf + c.knuckles + c.idle + c.beefy + c.shroud > 0
    this.bonkStacks = this.stacks('big_bonk')
  }

  // ───────────────────────────── combat ─────────────────────────────

  private onEnemyHit = (e: GameEvents['enemyHit']): void => {
    if (!e.procs) return
    for (let i = 0; i < this.held.length; i++) this.held[i].hooks.onHit?.(this.ctx, e.enemy, e.amount, e.crit, this.held[i].stacks)
    const lifesteal = this.stats.lifesteal
    if (lifesteal > 0) {
      const heal = lifestealHeal(lifesteal, this.runtime.rng.next())
      if (heal > 0) this.ctx.player?.heal(heal)
    }
  }

  outgoingMultiplier(enemy: Enemy): number {
    let m = 1
    const rt = this.runtime
    if (this.anyConditional) {
      const p = this.ctx.player
      const h = this.hit
      h.enemyHpFrac = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1
      h.airborne = !!p && !p.onGround
      h.distance = p
        ? Math.max(0, Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z) - enemy.def.radius * enemy.scale)
        : Infinity
      h.stillSeconds = rt.stillSeconds
      h.maxHp = this.stats.maxHp
      h.shroudActive = rt.shroudTime > 0
      m = conditionalMultiplier(this.conditional, h)
    }
    if (this.bonkStacks > 0 && rt.rng.chance(procChance(BIG_BONK_CHANCE, this.bonkStacks, this.stats.luck))) {
      m *= BIG_BONK_MULT
      const fx = this.ctx.fx
      fx.number(enemy.pos, 'BONK!', 'crit')
      fx.burst(enemy.pos, '#ffd23f', 14, 7, 0.35)
      fx.shake(0.25)
      rt.sfx('bonk', 1, 0.55, 0.05)
    }
    return m
  }

  tryCheatDeath(): boolean {
    if (this.stacks('stopwatch') <= 0 || this.runtime.stopwatchUsed) return false
    this.runtime.triggerStopwatch()
    return true
  }

  // ───────────────────────────── frame ─────────────────────────────

  update(dt: number): void {
    const run = this.ctx.run
    if (run.curse !== this.appliedCurse || run.greed !== this.appliedGreed) this.recompute()
    this.runtime.update(dt)
    for (let i = 0; i < this.held.length; i++) this.held[i].hooks.update?.(this.ctx, dt, this.held[i].stacks)
  }

  /** Unsubscribes and frees the item VFX. Game clears the bus on teardown; this is for explicit cleanup. */
  dispose(): void {
    for (const off of this.unsubs) off()
    this.unsubs.length = 0
    this.runtime.dispose()
  }
}
