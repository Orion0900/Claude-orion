/**
 * The glue between the overworld and everything else: the START menu, using
 * items and field moves, starting battles and dealing with how they end,
 * healing, giving critters, and blacking out.
 */
import { Rng } from '../core/rng'
import { applyItem, displayName, evolutionFor, itemWouldWork, levelUp, learnFree, makeCritter, restore } from '../battle/creature'
import type { Critter } from '../battle/types'
import { item as itemData, type ItemId } from '../data/items'
import { movesLearnedAt } from '../data/learn'
import { FIELD_MOVES, move as moveData, type FieldMoveId } from '../data/moves'
import { species, type SpeciesId } from '../data/species'
import { BOX_Y } from '../ui/Dialog'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { hooks } from '../world/hooks'
import type { TrainerDef } from '../world/mapTypes'
import type { Overworld } from '../world/Overworld'
import type { ScriptCtx, WildOptions } from '../world/script'
import { DELTA, TERRAIN } from '../world/terrain'
import { AlmanacScene } from '../scenes/AlmanacScene'
import { BagScene } from '../scenes/BagScene'
import { BattleScene, bagFor, type BattleResult } from '../scenes/battle/BattleScene'
import { EvolutionScene } from '../scenes/EvolutionScene'
import { MoveListScene } from '../scenes/MoveListScene'
import { NamingScene } from '../scenes/NamingScene'
import { OptionsScene } from '../scenes/OptionsScene'
import { PartyScene } from '../scenes/PartyScene'
import { StorageScene } from '../scenes/StorageScene'
import { TrainerCard } from '../scenes/TrainerCard'
import type { Game } from './Game'
import { Modal } from './scene'
import { itemCount, markCaught, markSeen, removeItem, stowCritter, writeGame, type SaveData } from './state'

/** Which MEDAL lets each field move be used outside battle. */
export const FIELD_MEDAL: Readonly<Record<FieldMoveId, number>> = { glow: 1, chop: 2, soar: 3, heave: 4, paddle: 5 }

/** Trainers' critters have middling, fixed determinant values. */
const TRAINER_DVS = { atk: 9, def: 8, spd: 8, spc: 8 }

// ─── Battle transition ────────────────────────────────────────────────────

/** The screen flashes, then black bars close in from the edges. */
class Transition extends Modal<void> {
  readonly opaque = false
  private t = 0

  constructor(private readonly style: number) {
    super()
  }

  update(): void {
    if (++this.t >= 56) this.finish()
  }

  draw(g: Gfx): void {
    const t = this.t
    if (t < 24) {
      g.invert = Math.floor(t / 4) % 2 === 0
      return
    }
    g.invert = false
    const k = (t - 24) / 32
    if (this.style % 2 === 0) {
      const h = Math.ceil(72 * k)
      g.rect(0, 0, 160, h, 3, 15)
      g.rect(0, 144 - h, 160, h, 3, 15)
    } else {
      for (let y = 0; y < 144; y += 8) {
        const w = Math.ceil(160 * Math.min(1, k * 1.4 - (y / 144) * 0.4))
        if (w > 0) {
          if ((y / 8) % 2) g.rect(0, y, w, 8, 3, 15)
          else g.rect(160 - w, y, w, 8, 3, 15)
        }
      }
    }
  }

  exit(): void {}
}

// ─── Critters ─────────────────────────────────────────────────────────────

function newCritter(save: SaveData, id: SpeciesId, level: number, place: string): Critter {
  const c = makeCritter(id, level, { rng: new Rng((save.seed ^ Date.now()) >>> 0), ot: save.name, otId: save.id, metPlace: place })
  return c
}

async function nickname(game: Game, c: Critter): Promise<void> {
  if (!(await game.ask(`Give a nickname to ${species(c.species).name}?`))) return
  const n = await game.run(new NamingScene(game, `${species(c.species).name}'S NAME?`, '', 10, species(c.species).name))
  c.nickname = n === species(c.species).name ? null : n
}

/** Puts a new critter in the party or a box, telling the player where it went. */
async function receive(game: Game, save: SaveData, c: Critter, askName: boolean): Promise<boolean> {
  markCaught(save, c.species)
  if (askName) await nickname(game, c)
  const where = stowCritter(save, c)
  if (where === null) {
    await game.say('Every box is full! There was nowhere to put it…')
    return false
  }
  if (where !== 'party') await game.say(`${displayName(c)} was sent to BOX ${where + 1} on the PC.`)
  return true
}

/** Runs evolutions for party members that levelled up (or used a coin). */
async function evolveParty(game: Game, save: SaveData, indexes: number[]): Promise<void> {
  for (const i of indexes) {
    const c = save.party[i]
    if (!c || c.hp <= 0) continue
    const to = evolutionFor(c)
    if (to) await game.run(new EvolutionScene(game, save, c, to))
  }
}

// ─── Battles ──────────────────────────────────────────────────────────────

async function runBattle(ow: Overworld, scene: BattleScene, music: Parameters<Game['audio']['playMusic']>[0], style: number): Promise<BattleResult> {
  const game = ow.game
  game.audio.sfx('encounter')
  game.audio.playMusic(music)
  await game.run(new Transition(style))
  game.setFade(0)
  const result = await game.run(scene)
  return result
}

async function afterBattle(ow: Overworld, r: BattleResult): Promise<void> {
  const game = ow.game
  const save = ow.save
  if (r.money > 0) save.money += r.money
  if (r.outcome === 'lose') {
    await blackout(ow, r.money)
    return
  }
  game.audio.playMusic(ow.map.def.music)
  await evolveParty(game, save, r.leveled)
}

async function blackout(ow: Overworld, lost: number): Promise<void> {
  const save = ow.save
  save.money = Math.max(0, save.money + lost)
  for (const c of save.party) restore(c)
  ow.setMode('walk')
  await ow.game.fadeOut()
  ow.load(save.heal.map, save.heal.x, save.heal.y, 'up')
  ow.game.audio.playMusic(ow.map.def.music)
  await ow.game.fadeIn()
  await ow.game.say('Everyone is rested and ready. Better be careful out there!')
}

function trainerCritters(t: TrainerDef): Critter[] {
  const rng = new Rng(t.id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7))
  return t.party.map((p) => makeCritter(p.species, p.level, { rng, dvs: TRAINER_DVS, moves: p.moves, ot: t.name, shiny: false }))
}

async function trainerBattle(ow: Overworld, t: TrainerDef): Promise<'win' | 'lose'> {
  const save = ow.save
  const foes = trainerCritters(t)
  for (const f of foes) markSeen(save, f.species)
  const npc = ow.npcs.find((n) => n.def.trainer?.id === t.id)
  const scene = new BattleScene(ow.game, {
    save,
    bg: ow.map.def.bg ?? (ow.map.def.kind === 'cave' ? 'cave' : ow.map.def.kind === 'indoor' ? 'indoor' : 'grass'),
    trainerLook: npc?.def.look ?? 'boy',
    setup: {
      kind: 'trainer',
      playerName: save.name,
      party: save.party,
      bag: bagFor(save),
      foes,
      trainer: { className: t.className, name: t.name, prize: t.prize, ai: t.ai ?? 'basic', items: t.items, loseText: t.lose },
      shareCharm: itemCount(save, 'shareCharm') > 0,
      playerMoney: t.canLose ? undefined : save.money,
      seed: (Date.now() ^ save.seed) >>> 0,
    },
  })
  const r = await runBattle(ow, scene, t.music ?? 'battleTrainer', 0)
  if (r.outcome === 'win') {
    save.flags[`beat:${t.id}`] = true
    await afterBattle(ow, r)
    return 'win'
  }
  if (t.canLose) {
    for (const c of save.party) restore(c)
    ow.game.audio.playMusic(ow.map.def.music)
    return 'lose'
  }
  await afterBattle(ow, r)
  return 'lose'
}

async function wildBattle(ow: Overworld, id: SpeciesId, level: number, o: WildOptions): Promise<BattleResult['outcome']> {
  const save = ow.save
  const foe = makeCritter(id, level, { rng: new Rng((Date.now() ^ save.seed ^ level) >>> 0), metPlace: ow.map.def.name })
  markSeen(save, id)
  const scene = new BattleScene(ow.game, {
    save,
    bg: ow.map.def.bg ?? (ow.map.def.kind === 'cave' ? 'cave' : 'grass'),
    setup: {
      kind: 'wild',
      playerName: save.name,
      party: save.party,
      bag: bagFor(save),
      foes: [foe],
      noRun: o.noRun,
      shareCharm: itemCount(save, 'shareCharm') > 0,
      playerMoney: save.money,
      seed: (Date.now() ^ save.seed ^ 0xabc) >>> 0,
    },
  })
  const r = await runBattle(ow, scene, o.music ?? 'battleWild', 1)
  if (r.outcome === 'caught' && r.caught) {
    const c = r.caught
    c.ot = save.name
    c.otId = save.id
    c.metPlace = ow.map.def.name
    c.metLevel = c.level
    ow.game.audio.playMusic(ow.map.def.music)
    if (!save.caught.includes(c.species)) {
      await ow.game.say(`${species(c.species).name}'s entry was added to the ALMANAC!`)
      void ow.game.audio.playJingle('almanac')
    }
    await receive(ow.game, save, c, true)
    await evolveParty(ow.game, save, r.leveled)
    return 'caught'
  }
  await afterBattle(ow, r)
  return r.outcome
}

// ─── Field moves ──────────────────────────────────────────────────────────

async function useFieldMove(ow: Overworld, s: ScriptCtx, index: number, m: FieldMoveId): Promise<boolean> {
  const save = ow.save
  const c = save.party[index]
  const need = FIELD_MEDAL[m]
  if (!save.medals.includes(need)) {
    await s.say(`A new MEDAL is needed to use ${moveData(m).name} outside battle.`)
    return false
  }
  const name = displayName(c)
  const kind = ow.frontKind()
  const f = ow.front()
  switch (m) {
    case 'chop':
      if (!TERRAIN[kind].cut) {
        await s.say("There's nothing here to chop.")
        return false
      }
      await s.say(`${name} used CHOP!`)
      s.sfx('hit')
      ow.map.edit(f.x, f.y, 'grass')
      return true
    case 'paddle':
      if (!TERRAIN[kind].swim || ow.player.swimming) {
        await s.say("There's no water to swim in here.")
        return false
      }
      await s.say(`${name} used PADDLE! ${save.name} climbed on its back.`)
      await startSwim(ow)
      return true
    case 'heave':
      save.flags.heave = true
      await s.say(`${name} used HEAVE! ${name} can push boulders now.`)
      return true
    case 'glow':
      if (!ow.map.def.dark) {
        await s.say("It's already bright here.")
        return false
      }
      ow.lit = true
      await s.say(`${name} used GLOW! The cave lit up.`)
      return true
    case 'soar':
      return soar(ow, s, name)
  }
}

async function startSwim(ow: Overworld): Promise<void> {
  const d = DELTA[ow.player.facing]
  ow.setMode('swim')
  await new Promise<void>((r) => ow.player.step(ow.player.facing as 'up', 16, r))
  void d
  ow.syncSave()
}

const TOWN_NAMES: Record<string, string> = {}

async function soar(ow: Overworld, s: ScriptCtx, name: string): Promise<boolean> {
  if (ow.map.def.kind !== 'town' && ow.map.def.kind !== 'route') {
    await s.say("You can't SOAR from here.")
    return false
  }
  const places = ow.save.visited.filter((id) => ow.world.has(id) && ow.world.map(id).def.soar)
  if (!places.length) return false
  const labels = places.map((id) => TOWN_NAMES[id] ?? ow.world.map(id).def.name)
  const k = await s.choose([...labels, 'CANCEL'], 'Where to?')
  if (k >= places.length) return false
  const to = ow.world.map(places[k])
  await s.say(`${name} used SOAR!`)
  await ow.warp(to.id, to.def.soar!.x, to.def.soar!.y, 'down', null)
  return true
}

// ─── Items in the field ───────────────────────────────────────────────────

async function useItem(ow: Overworld, s: ScriptCtx, id: ItemId): Promise<boolean> {
  const game = ow.game
  const save = ow.save
  const it = itemData(id)
  const e = it.effect
  switch (e.kind) {
    case 'heal':
    case 'cure':
    case 'revive':
    case 'pp':
    case 'vitamin':
    case 'ppUp':
    case 'level':
    case 'evolve': {
      for (;;) {
        const i = await game.run(new PartyScene(game, save, { mode: 'pick', item: id, battle: false }))
        if (i === null) return false
        const c = save.party[i]
        let slot: number | undefined
        if ((e.kind === 'pp' && !e.all) || e.kind === 'ppUp') {
          const ms = await game.run(new MoveListScene(game, c, { title: 'Which move?' }))
          if (ms === null) continue
          slot = ms
        }
        if (!itemWouldWork(c, id, slot)) {
          await s.say("It won't have any effect.")
          continue
        }
        removeItem(save, id)
        if (e.kind === 'level') {
          const step = levelUp(c)
          void game.audio.playJingle('levelUp')
          await s.say(`${displayName(c)} reached level ${step.level}!`)
          for (const m of step.moves) if (learnFree(c, m)) await s.say(`${displayName(c)} picked up ${moveData(m).name}!`)
          await evolveParty(game, save, [i])
          return true
        }
        if (e.kind === 'evolve') {
          const to = evolutionFor(c, id)!
          await game.run(new EvolutionScene(game, save, c, to, true))
          return true
        }
        game.audio.sfx('heal')
        const res = applyItem(c, id, slot)
        if (res.text) await s.say(res.text)
        if ((save.bag[id] ?? 0) <= 0) return false
      }
    }
    case 'disc': {
      const i = await game.run(new PartyScene(game, save, { mode: 'teach', teach: e.move }))
      if (i === null) return false
      const c = save.party[i]
      const name = displayName(c)
      if (c.moves.some((m) => m.id === e.move)) {
        await s.say(`${name} already knows ${moveData(e.move).name}.`)
        return false
      }
      await s.say(`${name} is learning ${moveData(e.move).name}…`)
      if (!learnFree(c, e.move)) {
        await s.say(`But ${name} already knows four moves.`)
        if (!(await s.ask(`Forget a move for ${moveData(e.move).name}?`))) return false
        const slot = await game.run(new MoveListScene(game, c, { title: 'Forget which move?' }))
        if (slot === null) return false
        await s.say(`${name} let go of ${moveData(c.moves[slot].id).name}…`)
        c.moves[slot] = { id: e.move, pp: moveData(e.move).pp, ups: 0 }
      }
      void game.audio.playJingle('levelUp')
      await s.say(`${name} picked up ${moveData(e.move).name}!`)
      return false
    }
    case 'repel':
      removeItem(save, id)
      save.repel = e.steps
      await s.say(`${save.name} sprayed the ${it.name}. Weak critters will keep away.`)
      return true
    case 'escape': {
      const esc = ow.map.def.escape
      if (!esc) {
        await s.say("That can't be used here.")
        return false
      }
      removeItem(save, id)
      await ow.warp(esc.map, esc.x, esc.y, 'down', 'stairs')
      return true
    }
    case 'capsule':
    case 'battleStat':
      await s.say("That's for battles.")
      return false
    default:
      return useKeyItem(ow, s, id)
  }
}

async function useKeyItem(ow: Overworld, s: ScriptCtx, id: ItemId): Promise<boolean> {
  const save = ow.save
  switch (id) {
    case 'bicycle':
      if (ow.map.def.kind === 'indoor' || ow.map.def.kind === 'cave') {
        await s.say("There's no room to ride here.")
        return false
      }
      if (ow.player.swimming) return false
      ow.setMode(ow.player.biking ? 'walk' : 'bike')
      await s.say(ow.player.biking ? `${save.name} got on the BICYCLE.` : `${save.name} got off the BICYCLE.`)
      return true
    case 'twigRod':
    case 'reelRod':
    case 'proRod':
      await fish(ow, s, id)
      return true
    case 'coinDetector': {
      const near = ow.map.def.items?.some((i) => i.hidden && !save.flags[`item:${i.id}`] && Math.abs(i.x - ow.player.x) <= 4 && Math.abs(i.y - ow.player.y) <= 4)
      s.sfx(near ? 'exclaim' : 'error')
      await s.say(near ? 'Beep beep! Something is hidden nearby!' : 'Silence. Nothing is hidden around here.')
      return false
    }
    case 'almanac':
      await ow.game.run(new AlmanacScene(ow.game, save))
      return false
    default:
      await s.say(`${itemData(id).desc}`)
      return false
  }
}

async function fish(ow: Overworld, s: ScriptCtx, rod: ItemId): Promise<void> {
  if (!TERRAIN[ow.frontKind()].fish) {
    await s.say("There's no water to fish in.")
    return
  }
  const table = rod === 'twigRod' ? ow.map.def.encounters?.fishTwig : rod === 'reelRod' ? ow.map.def.encounters?.fishReel : ow.map.def.encounters?.fishPro
  s.sfx('rodCast')
  await s.wait(40)
  if (!table || Math.random() * 100 > table.rate) {
    await s.say('Not even a nibble…')
    return
  }
  s.sfx('bite')
  await s.say('Oh! A bite!')
  const w = ow.pickWild(table)
  await s.wild(w.species, w.level)
}

// ─── The START menu ───────────────────────────────────────────────────────

async function startMenu(ow: Overworld): Promise<void> {
  const game = ow.game
  const save = ow.save
  let index = 0
  for (;;) {
    const items: [string, string][] = []
    if (save.flags.gotAlmanac) items.push(['ALMANAC', 'almanac'])
    if (save.party.length) items.push(['CRITTERS', 'party'])
    items.push(['BAG', 'bag'], [save.name, 'card'], ['SAVE', 'save'], ['OPTIONS', 'options'], ['EXIT', 'exit'])
    const k = await game.choose(
      items.map(([l]) => l),
      { start: Math.min(index, items.length - 1), y: 0, cancel: items.length - 1 },
    )
    index = k
    const what = items[k][1]
    const s = ow.ctx()
    switch (what) {
      case 'almanac':
        await game.run(new AlmanacScene(game, save))
        break
      case 'party': {
        let close = false
        await game.run(
          new PartyScene(game, save, {
            mode: 'field',
            onFieldMove: async (i, m) => {
              close = await useFieldMove(ow, s, i, m)
              return close
            },
          }),
        )
        if (close) return
        break
      }
      case 'bag': {
        let close = false
        await game.run(
          new BagScene(game, save, {
            mode: 'field',
            onUse: async (id) => {
              close = await useItem(ow, s, id)
              return close
            },
            onToss: async (id) => {
              if (await game.ask(`Throw away all the ${itemData(id).name}?`, { careful: true })) {
                removeItem(save, id, save.bag[id] ?? 0)
                await game.say(`Threw away the ${itemData(id).name}.`)
              }
            },
          }),
        )
        if (close) return
        break
      }
      case 'card':
        await game.run(new TrainerCard(game, save))
        break
      case 'save':
        if (await game.ask('Save your progress?')) {
          ow.syncSave()
          save.options = { ...game.options }
          if (writeGame(save)) {
            void game.audio.playJingle('save')
            await game.say(`${save.name} saved the game.`)
          } else await game.say('Saving failed. This browser may be blocking storage.')
        }
        break
      case 'options':
        await game.run(new OptionsScene(game))
        break
      default:
        return
    }
  }
}

/** A pressed toward terrain with nobody there. */
async function facing(ow: Overworld): Promise<void> {
  const s = ow.ctx()
  const save = ow.save
  const kind = ow.frontKind()
  const info = TERRAIN[kind]
  const text: Partial<Record<string, string>> = {
    bookshelf: 'Shelves full of books about critters.',
    tv: 'A show about a critter detective is on. It solves the case by sniffing!',
    machine: 'Lights blink on some strange machine.',
    statue: 'A statue of a critter. Its eyes seem to follow you.',
    mailbox: 'Nothing in the mailbox.',
    graves: 'A weathered stone. The name has worn away.',
  }
  if (info.pc) {
    await game(ow).run(new StorageScene(ow.game, save))
    return
  }
  if (text[kind]) {
    await s.say(text[kind]!)
    return
  }
  if (info.cut) {
    const who = save.party.findIndex((c) => c.moves.some((m) => m.id === 'chop'))
    if (who >= 0 && save.medals.includes(FIELD_MEDAL.chop)) {
      if (await s.ask('This thorny bush looks like it could be chopped. Use CHOP?')) await useFieldMove(ow, s, who, 'chop')
    } else await s.say('A thorny bush blocks the way.')
    return
  }
  if (info.swim && !ow.player.swimming) {
    const who = save.party.findIndex((c) => c.moves.some((m) => m.id === 'paddle'))
    if (who >= 0 && save.medals.includes(FIELD_MEDAL.paddle)) {
      if (await s.ask('The water is calm. Want to swim across with PADDLE?')) await useFieldMove(ow, s, who, 'paddle')
    } else if (info.fish && (itemCount(save, 'twigRod') || itemCount(save, 'reelRod') || itemCount(save, 'proRod'))) {
      const rod: ItemId = itemCount(save, 'proRod') ? 'proRod' : itemCount(save, 'reelRod') ? 'reelRod' : 'twigRod'
      if (await s.ask(`Fish with the ${itemData(rod).name}?`)) await fish(ow, s, rod)
    } else await s.say('The water is deep and blue.')
    return
  }
}

function game(ow: Overworld): Game {
  return ow.game
}

async function select(ow: Overworld): Promise<void> {
  const s = ow.ctx()
  if (itemCount(ow.save, 'bicycle')) await useKeyItem(ow, s, 'bicycle')
}

async function healParty(ow: Overworld): Promise<void> {
  for (const c of ow.save.party) restore(c)
  await ow.game.audio.playJingle('heal')
}

/** Wires the overworld's hooks to the scenes. Call once at boot. */
export function installHooks(): void {
  hooks.startMenu = async (s) => startMenu(owOf(s))
  hooks.select = async (s) => select(owOf(s))
  hooks.facing = async (s) => facing(owOf(s))
  hooks.trainerBattle = trainerBattle
  hooks.wildBattle = wildBattle
  hooks.healParty = healParty
  hooks.giveCritter = async (ow, id, level, askName) => {
    const c = newCritter(ow.save, id, level, ow.map.def.name)
    void ow.game.audio.playJingle('keyItemGet')
    await ow.game.say(`${ow.save.name} received ${species(id).name}!`)
    return receive(ow.game, ow.save, c, askName)
  }
}

/** The overworld behind a script context. */
let currentOw: Overworld | null = null
export function setOverworld(ow: Overworld): void {
  currentOw = ow
}
function owOf(_s: ScriptCtx): Overworld {
  if (!currentOw) throw new Error('no overworld')
  return currentOw
}

/** Fishing and field moves for the tests. */
export const _internals = { useFieldMove, fish, FIELD_MOVES, BOX_Y, movesLearnedAt }

export type { Pad }
