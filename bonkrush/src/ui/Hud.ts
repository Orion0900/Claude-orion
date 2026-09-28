import type { GameContext } from '../game/types'
import { STAGES } from '../data/stages'
import { POP, SHAKE, el, fitCanvas, pulse } from './dom'
import { formatCount, fraction, promptLabel, timerKey, timerLabel } from './format'
import { MapView } from './MapView'
import { StatList, buildInventory } from './panels'

interface SlotView {
  root: HTMLDivElement
  icon: HTMLSpanElement
  badge: HTMLSpanElement
  id: string
  level: number
}

/** Seconds between minimap canvas size checks (reading layout every frame is wasteful). */
const FIT_INTERVAL = 0.5
/** Seconds between stat list refreshes while the Tab overlay is up. */
const TAB_STATS_INTERVAL = 0.25
const LOW_HP = 0.3

/**
 * The in-run HUD. `update` runs every frame, so every value is cached and
 * the DOM is only written when what it shows actually changes.
 */
export class Hud {
  readonly root: HTMLDivElement
  private readonly map = new MapView()

  private readonly lvlNum: HTMLSpanElement
  private readonly lvlBadge: HTMLDivElement
  private readonly hpBar: HTMLDivElement
  private readonly hpFill: HTMLDivElement
  private readonly shieldFill: HTMLDivElement
  private readonly hpText: HTMLSpanElement
  private readonly weaponRow: HTMLDivElement
  private readonly tomeRow: HTMLDivElement
  private weaponSlots: SlotView[] = []
  private tomeSlots: SlotView[] = []

  private readonly timerBox: HTMLDivElement
  private readonly timer: HTMLDivElement
  private readonly timerSub: HTMLDivElement
  private readonly stageName: HTMLDivElement
  private readonly bossBar: HTMLDivElement
  private readonly bossName: HTMLSpanElement
  private readonly bossHp: HTMLSpanElement
  private readonly bossFill: HTMLDivElement

  private readonly kills: HTMLSpanElement
  private readonly gold: HTMLSpanElement
  private readonly goldBox: HTMLDivElement
  private readonly silver: HTMLSpanElement
  private readonly mini: HTMLCanvasElement
  private miniSize = 0
  private fitIn = 0

  private readonly prompt: HTMLDivElement
  private readonly promptText: HTMLSpanElement
  private readonly xpFill: HTMLDivElement
  private readonly xpText: HTMLSpanElement
  private readonly xpBar: HTMLDivElement

  private readonly tab: HTMLDivElement
  private readonly bigMap: HTMLCanvasElement
  private bigSize = 0
  private readonly stats = new StatList()
  private readonly tabInv: HTMLDivElement
  private tabOpen = false
  private tabStatsIn = 0

  // Last values shown; NaN / sentinel strings force the first write.
  private cHp = NaN
  private cMax = NaN
  private cShield = NaN
  private cLevel = NaN
  private cTimer = NaN
  private cStage = ''
  private cKills = NaN
  private cGold = NaN
  private cSilver = NaN
  private cBoss = false
  private cBossName = ''
  private cBossFrac = NaN
  private cBossHp = NaN
  private cPromptText: string | null = null
  private cPromptCost: number | undefined = undefined
  private cPromptOk = true
  private cXp = NaN
  private lastGoldPulse = 0
  private clock = 0

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', undefined, parent)
    el('div', 'lowhp-vignette', undefined, this.root)

    const tl = el('div', 'hud-tl', undefined, this.root)
    const hpRow = el('div', 'hp-row', undefined, tl)
    this.lvlBadge = el('div', 'lvl-badge', undefined, hpRow)
    el('span', 'lvl-cap', 'LV', this.lvlBadge)
    this.lvlNum = el('span', 'lvl-num ol', '1', this.lvlBadge)
    this.hpBar = el('div', 'hpbar', undefined, hpRow)
    this.hpFill = el('div', 'hpbar-fill', undefined, this.hpBar)
    this.shieldFill = el('div', 'hpbar-shield', undefined, this.hpBar)
    this.hpText = el('span', 'hpbar-text ol', '', this.hpBar)
    const slots = el('div', 'slots', undefined, tl)
    this.weaponRow = el('div', 'slot-row weapons', undefined, slots)
    this.tomeRow = el('div', 'slot-row tomes', undefined, slots)

    const tc = el('div', 'hud-tc', undefined, this.root)
    this.timerBox = el('div', 'timer-box', undefined, tc)
    this.timer = el('div', 'timer ol', '10:00', this.timerBox)
    this.timerSub = el('div', 'timer-sub ol', '', this.timerBox)
    this.stageName = el('div', 'stage-name ol', '', tc)
    this.bossBar = el('div', 'bossbar', undefined, tc)
    const head = el('div', 'bossbar-head', undefined, this.bossBar)
    this.bossName = el('span', 'bossbar-name ol', '', head)
    this.bossHp = el('span', 'bossbar-hp ol', '', head)
    const track = el('div', 'bossbar-track', undefined, this.bossBar)
    this.bossFill = el('div', 'bossbar-fill', undefined, track)

    const tr = el('div', 'hud-tr', undefined, this.root)
    const counters = el('div', 'counters', undefined, tr)
    this.kills = counter(counters, 'kills', '💀')
    this.gold = counter(counters, 'gold', '🪙')
    this.goldBox = this.gold.parentElement as HTMLDivElement
    this.silver = counter(counters, 'silver', '')
    const miniWrap = el('div', 'minimap-wrap', undefined, tr)
    this.mini = el('canvas', 'minimap', undefined, miniWrap)

    this.prompt = el('div', 'prompt hidden', undefined, this.root)
    this.promptText = el('span', 'prompt-text ol', '', this.prompt)

    this.xpBar = el('div', 'xpbar', undefined, this.root)
    this.xpFill = el('div', 'xpbar-fill', undefined, this.xpBar)
    this.xpText = el('span', 'xpbar-text ol', '', this.xpBar)

    this.tab = el('div', 'tab-overlay hidden', undefined, this.root)
    const panel = el('div', 'panel tab-panel', undefined, this.tab)
    const mapCol = el('div', 'tab-map', undefined, panel)
    el('div', 'panel-title ol', 'Map', mapCol)
    this.bigMap = el('canvas', 'bigmap', undefined, mapCol)
    legend(mapCol)
    const statCol = el('div', 'tab-stats', undefined, panel)
    el('div', 'panel-title ol', 'Stats', statCol)
    statCol.appendChild(this.stats.el)
    this.tabInv = el('div', 'tab-inv', undefined, panel)
  }

  /** Points the HUD at a run (new run or new stage): resets caches and slots, re-bakes the map. */
  bind(ctx: GameContext | null): void {
    this.root.classList.toggle('hidden', !ctx)
    this.setTab(false, null)
    this.map.invalidate()
    this.cHp = this.cMax = this.cShield = this.cLevel = this.cTimer = NaN
    this.cKills = this.cGold = this.cSilver = this.cXp = this.cBossFrac = this.cBossHp = NaN
    this.cStage = ''
    this.cBoss = false
    this.cBossName = ''
    this.bossBar.classList.remove('show')
    this.cPromptText = null
    this.prompt.classList.add('hidden')
    this.timerBox.classList.remove('swarm', 'urgent')
    this.root.classList.remove('low-hp')
    this.fitIn = 0
    if (!ctx) return
    this.weaponSlots = buildSlots(this.weaponRow, clampSlots(ctx.weapons.maxSlots))
    this.tomeSlots = buildSlots(this.tomeRow, clampSlots(ctx.progression.maxTomes))
  }

  flashLevelUp(): void {
    pulse(this.lvlBadge, [{ transform: 'scale(1) rotate(0)' }, { transform: 'scale(1.5) rotate(-8deg)' }, { transform: 'scale(1)' }], 520)
    pulse(this.xpBar, [{ filter: 'brightness(2.4)' }, { filter: 'brightness(1)' }], 700)
  }

  pulseGold(): void {
    if (this.clock - this.lastGoldPulse < 0.12) return
    this.lastGoldPulse = this.clock
    pulse(this.goldBox, POP, 240)
  }

  hurt(): void {
    pulse(this.hpBar, SHAKE, 260)
  }

  swarm(): void {
    pulse(this.timerBox, [{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(0.9)', opacity: 1 }, { transform: 'scale(1)' }], 600)
  }

  update(ctx: GameContext, dt: number, tabHeld: boolean): void {
    this.clock += dt
    this.map.tick(dt)
    this.updateVitals(ctx)
    this.updateSlots(ctx)
    this.updateTop(ctx)
    this.updatePrompt(ctx)
    this.updateXp(ctx)

    this.fitIn -= dt
    if (this.fitIn <= 0) {
      this.fitIn = FIT_INTERVAL
      this.miniSize = fitCanvas(this.mini)
    }
    this.map.drawMini(this.mini, this.miniSize, ctx)

    if (tabHeld !== this.tabOpen) this.setTab(tabHeld, ctx)
    if (this.tabOpen) {
      this.map.drawFull(this.bigMap, this.bigSize, ctx)
      this.tabStatsIn -= dt
      if (this.tabStatsIn <= 0) {
        this.tabStatsIn = TAB_STATS_INTERVAL
        this.stats.update(ctx.progression.stats)
      }
    }
  }

  private setTab(open: boolean, ctx: GameContext | null): void {
    this.tabOpen = open && !!ctx
    this.tab.classList.toggle('hidden', !this.tabOpen)
    if (!this.tabOpen || !ctx) {
      this.tabInv.replaceChildren()
      return
    }
    this.tabInv.replaceChildren(buildInventory(ctx))
    this.stats.update(ctx.progression.stats)
    this.tabStatsIn = TAB_STATS_INTERVAL
    this.bigSize = fitCanvas(this.bigMap)
  }

  private updateVitals(ctx: GameContext): void {
    const max = Math.max(1, Math.round(ctx.progression.stats.maxHp))
    const hp = Math.max(0, Math.ceil(ctx.player.hp))
    const shield = Math.max(0, Math.ceil(ctx.player.shield))
    if (hp !== this.cHp || max !== this.cMax || shield !== this.cShield) {
      this.cHp = hp
      this.cMax = max
      this.cShield = shield
      this.hpFill.style.transform = `scaleX(${fraction(hp, max)})`
      this.shieldFill.style.transform = `scaleX(${fraction(shield, max)})`
      this.hpText.textContent = shield > 0 ? `${hp} / ${max}  +${shield}🛡️` : `${hp} / ${max}`
      this.root.classList.toggle('low-hp', hp > 0 && hp / max < LOW_HP)
    }
    const level = ctx.progression.level
    if (level !== this.cLevel) {
      this.cLevel = level
      this.lvlNum.textContent = String(level)
      this.xpText.textContent = `LV ${level}`
    }
  }

  private updateSlots(ctx: GameContext): void {
    const owned = ctx.weapons.owned
    for (let i = 0; i < this.weaponSlots.length; i++) {
      const w = owned[i]
      setSlot(this.weaponSlots[i], w ? w.def.id : '', w ? w.level : 0, w?.def.icon, w?.def.color)
    }
    const tomes = ctx.progression.tomes
    for (let i = 0; i < this.tomeSlots.length; i++) {
      const t = tomes[i]
      setSlot(this.tomeSlots[i], t ? t.def.id : '', t ? t.level : 0, t?.def.icon, '#c86bff')
    }
  }

  private updateTop(ctx: GameContext): void {
    const run = ctx.run
    const key = timerKey(run.stageTime, run.stageDuration)
    if (key !== this.cTimer) {
      const wasSwarm = this.cTimer <= 0
      this.cTimer = key
      const t = timerLabel(key)
      this.timer.textContent = t.text
      this.timerSub.textContent = t.sub
      this.timerBox.classList.toggle('swarm', t.swarm)
      this.timerBox.classList.toggle('urgent', t.urgent)
      if (t.swarm && !wasSwarm) this.swarm()
    }
    if (ctx.stage.name !== this.cStage) {
      this.cStage = ctx.stage.name
      this.stageName.textContent = `${ctx.stage.name} · ${ctx.stage.index + 1}/${STAGES.length}`
    }
    const kills = run.kills
    if (kills !== this.cKills) {
      this.cKills = kills
      this.kills.textContent = formatCount(kills)
    }
    const gold = Math.floor(run.gold)
    if (gold !== this.cGold) {
      this.cGold = gold
      this.gold.textContent = formatCount(gold)
    }
    const silver = Math.floor(run.silver)
    if (silver !== this.cSilver) {
      this.cSilver = silver
      this.silver.textContent = formatCount(silver)
    }

    const boss = ctx.enemies.boss
    const alive = !!boss && boss.alive && boss.hp > 0
    if (alive !== this.cBoss) {
      this.cBoss = alive
      this.bossBar.classList.toggle('show', alive)
    }
    if (boss && alive) {
      if (boss.def.name !== this.cBossName) {
        this.cBossName = boss.def.name
        this.bossName.textContent = boss.def.name
      }
      const frac = Math.round(fraction(boss.hp, boss.maxHp) * 1000) / 1000
      if (frac !== this.cBossFrac) {
        this.cBossFrac = frac
        this.bossFill.style.transform = `scaleX(${frac})`
      }
      const hp = Math.ceil(boss.hp)
      if (hp !== this.cBossHp) {
        this.cBossHp = hp
        this.bossHp.textContent = `${formatCount(hp)} / ${formatCount(boss.maxHp)}`
      }
    }
  }

  private updatePrompt(ctx: GameContext): void {
    const p = ctx.interactables.prompt
    if (!p) {
      if (this.cPromptText !== null) {
        this.cPromptText = null
        this.prompt.classList.add('hidden')
      }
      return
    }
    const ok = p.cost === undefined || Math.floor(ctx.run.gold) >= p.cost
    if (p.text === this.cPromptText && p.cost === this.cPromptCost && ok === this.cPromptOk) return
    const first = this.cPromptText === null
    this.cPromptText = p.text
    this.cPromptCost = p.cost
    this.cPromptOk = ok
    const label = promptLabel(p, ctx.input.isTouch, ctx.run.gold)
    this.promptText.textContent = label.text
    this.prompt.classList.toggle('poor', !label.affordable)
    this.prompt.classList.remove('hidden')
    if (first) pulse(this.prompt, [{ transform: 'translateY(12px) scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], 220)
  }

  private updateXp(ctx: GameContext): void {
    const p = ctx.progression
    const frac = Math.round(fraction(p.xp, p.xpToNext) * 500) / 500
    if (frac !== this.cXp) {
      this.cXp = frac
      this.xpFill.style.transform = `scaleX(${frac})`
    }
  }
}

function counter(parent: HTMLElement, kind: string, icon: string): HTMLSpanElement {
  const box = el('div', `counter ${kind}`, undefined, parent)
  if (icon) el('span', 'counter-icon', icon, box)
  else el('span', 'coin silver', undefined, box)
  return el('span', 'counter-value ol', '0', box)
}

function clampSlots(n: number): number {
  return Number.isFinite(n) ? Math.min(8, Math.max(1, Math.floor(n))) : 4
}

function buildSlots(row: HTMLDivElement, n: number): SlotView[] {
  row.replaceChildren()
  const out: SlotView[] = []
  for (let i = 0; i < n; i++) {
    const root = el('div', 'slot empty', undefined, row)
    out.push({
      root,
      icon: el('span', 'slot-icon', '', root),
      badge: el('span', 'slot-lvl ol', '', root),
      id: '',
      level: 0,
    })
  }
  return out
}

function setSlot(s: SlotView, id: string, level: number, icon: string | undefined, color: string | undefined): void {
  if (s.id === id && s.level === level) return
  const changedThing = s.id !== id
  const levelledUp = !changedThing && level > s.level
  s.id = id
  s.level = level
  s.root.classList.toggle('empty', !id)
  s.icon.textContent = id ? (icon ?? '?') : ''
  s.badge.textContent = id ? String(level) : ''
  if (color) s.root.style.setProperty('--sc', color)
  if ((changedThing && id) || levelledUp) pulse(s.root, POP, 320)
}

function legend(parent: HTMLElement): void {
  const box = el('div', 'map-legend', undefined, parent)
  const entries: Array<[string, string]> = [
    ['#ffd23f', 'Chest'],
    ['#3de0c8', 'Shrine'],
    ['#f5a300', 'Greed'],
    ['#4aa8ff', 'Magnet'],
    ['#c86bff', 'Challenge'],
    ['#ff4d5e', 'Curse'],
    ['#f4ecd8', 'Altar'],
    ['#b36bff', 'Portal'],
  ]
  for (const [color, name] of entries) {
    const item = el('span', 'legend-item', undefined, box)
    const dot = el('i', 'legend-dot', undefined, item)
    dot.style.background = color
    el('span', '', name, item)
  }
}
