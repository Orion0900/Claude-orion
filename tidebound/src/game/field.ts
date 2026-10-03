import { PLAYER_LOOKS } from '../art/look'
import { Battle } from '../battle/Battle'
import { createCreature, displayName, evolutionFor, healFull, itemWouldWork, useItemInField } from '../battle/creature'
import type { BattleSetup, Creature, Outcome, Prompt } from '../battle/types'
import { Rng } from '../core/rng'
import { dex, type SpeciesId } from '../data/dex'
import { item, type ItemId } from '../data/items'
import { BagScene } from '../scenes/BagScene'
import { BattleScene, type BattlePresentation, type BattleUi } from '../scenes/battle/BattleScene'
import { DexScene } from '../scenes/DexScene'
import { EvolutionScene } from '../scenes/EvolutionScene'
import { OptionsScene } from '../scenes/OptionsScene'
import { PartyScene } from '../scenes/PartyScene'
import { sellFlow, ShopScene } from '../scenes/ShopScene'
import { StartMenu } from '../scenes/StartMenu'
import { StorageScene } from '../scenes/StorageScene'
import { SummaryScene } from '../scenes/SummaryScene'
import { TrainerCard, playTime } from '../scenes/TrainerCard'
import { Curtain, Wipe } from '../scenes/transitions'
import { CH } from '../ui/font'
import { overworldHooks } from '../world/hooks'
import type { TrainerDef } from '../world/mapTypes'
import { marketHooks } from '../world/maps/interiors'
import { endingHooks } from '../world/maps/beacon'
import { CreditsScene } from '../scenes/CreditsScene'
import type { Overworld } from '../world/Overworld'
import type { ScriptCtx, WildOptions } from '../world/script'
import type { Game } from './Game'
import { BOX_CAPACITY, healthyCount, markCaught, markSeen, MAX_PARTY, nextSeed, removeItem, writeGame, type SaveData } from './state'

type EndPrompt = Extract<Prompt, { kind: 'end' }>

/**
 * The glue between the overworld and everything it opens: the START menu,
 * items, the Haven PC, Markets, and above all battles — the cut into them,
 * and what happens after (prize money, catching, evolving, blacking out).
 */
export function installFieldHooks(game: Game): void {
  overworldHooks.healParty = (save) => save.party.forEach(healFull)
  overworldHooks.giveBeast = (s, ow, species, level, place) => giveBeast(game, s, ow, species, level, place)
  overworldHooks.startMenu = (s) => startMenu(game, s)
  overworldHooks.select = async (s) => {
    const ow = currentOverworld(game)
    if (ow && s.save.bag.driftRod && ow.facingWater() && !ow.player.surfing) await ow.fish(s)
  }
  overworldHooks.use = async (s, ow, what) => {
    switch (what) {
      case 'water': {
        if (ow.player.surfing) return
        const surfer = ow.canSurf()
        if (surfer) {
          if (await s.ask(`The water is calm and deep.\fWould you like to ride on ${dex(surfer).name}?`)) await ow.startSurf(s)
          return
        }
        if (s.save.bag.driftRod) {
          if (await s.ask('The water is teeming with life. Fish here?')) await ow.fish(s)
          return
        }
        await s.say('The water is a deep, clear blue.')
        return
      }
      case 'pc':
        if (ow.map.def.haven) {
          s.sfx('menuOpen')
          await s.say('{PLAYER} booted up the PC.')
          await game.run(new StorageScene(game, s.save))
        } else await s.say("It's a PC. The desktop is covered in pictures of beasts.")
        return
      case 'tv':
        await s.say('A show about beasts of the deep sea is on. A glowing jelly drifts across the screen.')
        return
      case 'bookshelf':
        await s.say('It\'s crammed with books about beasts and the sea.')
        return
      case 'machine':
        await s.say('A complicated machine. Lights blink in a pattern that almost looks like waves.')
        return
      case 'mailbox':
        await s.say('A mailbox. There\'s nothing inside but sand.')
        return
      case 'healer':
        await s.say('A machine for resting beasts. The keeper runs it.')
        return
      case 'sign':
        await s.say('The words have been worn away by the salty wind.')
        return
    }
  }
  overworldHooks.trainerBattle = (s, ow, t, npc) => trainerBattle(game, s, ow, t, npc?.look)
  overworldHooks.wildBattle = (s, ow, species, level, o) => wildBattle(game, s, ow, species, level, o)
  endingHooks.credits = async (s) => {
    const save = s.save
    const ow = currentOverworld(game)
    await game.fadeOut(90, '#ffffff')
    const credits = new CreditsScene(game, save)
    game.push(credits)
    game.setFade(0)
    await credits.play()
    await game.fadeOut(60)
    game.pop(credits)
    save.party.forEach(healFull)
    save.lastHaven = { map: 'home1f', x: 4, y: 5 }
    if (ow) {
      ow.load('home2f', 3, 4, 'down')
      ow.syncSave()
      game.audio.playMusic('home')
    }
    writeGame(save)
    await game.fadeIn(40)
    await s.say('Your progress has been saved.\fThe tide always returns. Somewhere out there, beasts you have never seen are waiting…')
  }
  marketHooks.shop = async (s, stock) => {
    await s.say('Welcome! How can I help you?')
    for (;;) {
      const i = await s.choose('What would you like to do?', ['BUY', 'SELL', 'QUIT'])
      if (i === 0) await game.run(new ShopScene(game, s.save, stock))
      else if (i === 1) await sellFlow(game, s.save, () => game.run(new BagScene(game, s.save, 'sell')))
      else break
    }
    await s.say('Please come again!')
  }
}

let overworldRef: Overworld | null = null

/** The overworld in play, set when a game starts. */
export function setCurrentOverworld(ow: Overworld | null): void {
  overworldRef = ow
}

function currentOverworld(_game: Game): Overworld | null {
  return overworldRef
}

// ─── Beasts ─────────────────────────────────────────────────────────────

async function giveBeast(game: Game, s: ScriptCtx, _ow: Overworld, species: SpeciesId, level: number, place: string): Promise<void> {
  const rng = new Rng(nextSeed(s.save))
  const c = createCreature(species, level, rng, { ot: s.save.name, metPlace: place })
  markCaught(s.save, species)
  void game.audio.playJingle('keyItemGet')
  await s.say(`{PLAYER} received ${dex(species).name}!`)
  await store(game, s.save, c)
}

/** Puts a new beast in the party, or in storage when the party is full. */
async function store(game: Game, save: SaveData, c: Creature): Promise<void> {
  if (save.party.length < MAX_PARTY) {
    save.party.push(c)
    return
  }
  if (save.box.length < BOX_CAPACITY) {
    save.box.push(c)
    await game.say(`${displayName(c)} was sent to the HAVEN PC.`)
    return
  }
  await game.say(`There's no room anywhere for ${displayName(c)}… It was released back to the wild.`)
}

// ─── Battles ────────────────────────────────────────────────────────────

function battleUi(game: Game, save: SaveData): BattleUi {
  const party = save.party
  return {
    pickSwitch: async (forced) => {
      for (;;) {
        const scene = new PartyScene(game, party, forced ? 'forced' : 'battle', forced ? 'Choose a beast to send out.' : undefined, async (i) => {
          const pick = await game.choose(['SHIFT', 'SUMMARY', 'CANCEL'], { y: 128 - 60 })
          if (pick === 1) {
            await game.run(new SummaryScene(game, party, i, undefined, { name: save.name, id: save.trainerId }))
            return null
          }
          return pick === 0 ? 'use' : null
        })
        const r = await game.run(scene)
        if (!r) return null
        const c = party[r.index]
        if (c.hp <= 0) {
          await game.say(`${displayName(c)} has no energy left to battle!`)
          continue
        }
        return r.index
      }
    },
    pickItem: async () => {
      for (;;) {
        const id = await game.run(new BagScene(game, save, 'battle'))
        if (!id) return null
        const use = item(id).use
        if (use.kind === 'orb') return { item: id }
        if (use.kind === 'heal' || use.kind === 'cure' || use.kind === 'revive' || use.kind === 'pp') {
          const r = await game.run(new PartyScene(game, party, 'item'))
          if (!r) continue
          if (!itemWouldWork(party[r.index], id)) {
            await game.say("It won't have any effect.")
            continue
          }
          return { item: id, partyIndex: r.index }
        }
        await game.say("That can't be used in battle.")
      }
    },
    pickForget: (i, move) => game.run(new SummaryScene(game, party, i, { move }, { name: save.name, id: save.trainerId })),
    nameOf: (i) => (party[i] ? displayName(party[i]) : '???'),
    seen: (species) => markSeen(save, species),
  }
}

interface BattleRun {
  setup: Omit<BattleSetup, 'party' | 'bag' | 'playerName' | 'seed'>
  pres: Omit<BattlePresentation, 'playerLook' | 'playerName' | 'quick'>
  wipe: 'bars' | 'spiral'
}

async function runBattle(game: Game, save: SaveData, run: BattleRun): Promise<EndPrompt> {
  const setup: BattleSetup = {
    ...run.setup,
    playerName: save.name,
    party: save.party,
    bag: {
      count: (id: ItemId) => save.bag[id] ?? 0,
      remove: (id: ItemId, n = 1) => removeItem(save, id, n),
    },
    seed: nextSeed(save),
  }
  const pres: BattlePresentation = {
    ...run.pres,
    playerLook: PLAYER_LOOKS[save.lookIndex] ?? PLAYER_LOOKS[0],
    playerName: save.name,
    quick: !game.options.battleAnims,
  }
  game.audio.playMusic(pres.music)
  game.audio.sfx('encounter')
  await game.run(new Wipe(run.wipe))
  const scene = new BattleScene(game, new Battle(setup), pres, battleUi(game, save))
  game.push(scene)
  const end = await scene.run()
  await game.fadeOut(24)
  game.pop(scene)
  return end
}

async function afterBattle(game: Game, s: ScriptCtx, ow: Overworld, end: EndPrompt, canLose: boolean): Promise<void> {
  const save = s.save
  if (end.outcome === 'lose') {
    if (canLose) {
      save.party.forEach(healFull)
      game.audio.playMusic(ow.map.def.music)
      await game.fadeIn(20)
      return
    }
    await blackout(game, s, ow)
    return
  }
  if (end.money > 0) save.money = Math.min(999999, save.money + end.money)
  if (end.outcome === 'caught' && end.caught) await caught(game, save, end.caught, ow.map.def.name)
  // Evolutions, one at a time, for beasts that levelled up.
  const seen = new Set<number>()
  for (const i of end.leveled) {
    if (seen.has(i)) continue
    seen.add(i)
    const c = save.party[i]
    if (!c || c.hp <= 0) continue
    const into = evolutionFor(c)
    if (!into) continue
    const evo = new EvolutionScene(game, c, into)
    game.push(evo)
    await evo.play(save)
    await game.fadeOut(16)
    game.pop(evo)
  }
  game.audio.playMusic(ow.player.surfing ? 'surf' : ow.map.def.music)
  await game.fadeIn(20)
}

async function caught(game: Game, save: SaveData, c: Creature, place: string): Promise<void> {
  c.ot = save.name
  c.metPlace = place
  const isNew = !save.caught.includes(c.species)
  markCaught(save, c.species)
  if (isNew && save.flags.dex) {
    await game.say(`${dex(c.species).name}'s data was added to the BEASTIARY.`)
    game.audio.sfx('dexOpen')
    await game.run(new DexScene(game, save, dex(c.species)))
  }
  await store(game, save, c)
}

async function blackout(game: Game, s: ScriptCtx, ow: Overworld): Promise<void> {
  const save = s.save
  const lost = Math.floor(save.money / 2)
  save.money -= lost
  // The text goes on a black screen of its own: under the fade it couldn't be read.
  const curtain = new Curtain()
  game.push(curtain)
  game.setFade(0)
  await game.say(`${save.name} has no beasts left who can battle!`)
  if (lost > 0) await game.say(`${save.name} dropped ${CH.shell}${lost} in the scramble…`)
  await game.say(`${save.name} hurried back to safety with the tired beasts…`)
  save.party.forEach(healFull)
  const h = save.lastHaven
  ow.player.surfing = false
  save.surfing = false
  ow.load(h.map, h.x, h.y, 'down')
  ow.syncSave()
  game.setFade(1)
  game.pop(curtain)
  game.audio.playMusic(ow.map.def.music)
  await game.fadeIn(24)
  const keeper = ow.npcs.find((n) => n.def.id === 'keeper')
  if (keeper) await s.say('Your beasts are fully rested now. Take care out there!')
  else await s.say('MUM: Oh, you poor thing! Your beasts are rested now. Be careful out there!')
}

async function trainerBattle(game: Game, s: ScriptCtx, ow: Overworld, t: TrainerDef, npcLook?: import('../art/look').Look): Promise<boolean> {
  const save = s.save
  if (healthyCount(save) === 0) return false
  const rng = new Rng(nextSeed(save))
  const strong = t.ai === 'smart'
  const foes = t.party.map((p) => createCreature(p.species, p.level, rng, { ot: t.name, shiny: false, ivs: fixedIvs(strong ? 22 : 12) }))
  const warden = t.className === 'WARDEN' || t.className === 'CHAMPION'
  const end = await runBattle(game, save, {
    setup: {
      kind: 'trainer',
      foes,
      trainer: { className: t.className, name: t.name, prize: t.prize, ai: t.ai ?? 'basic', items: t.items ? [...t.items] : undefined, loseText: t.lose },
      dark: !!ow.map.def.dark,
    },
    pres: {
      bg: ow.map.def.bg,
      trainer: { look: npcLook ?? t.look ?? PLAYER_LOOKS[0], title: `${t.className} ${t.name}`, loseText: t.lose },
      music: t.music ?? (warden ? 'battleWarden' : 'battleTrainer'),
      victory: warden ? 'victoryWarden' : 'victoryTrainer',
    },
    wipe: 'spiral',
  })
  const won = end.outcome === 'win'
  if (won) s.setFlag(`beat:${t.id}`)
  await afterBattle(game, s, ow, end, !!t.canLose)
  return won
}

async function wildBattle(game: Game, s: ScriptCtx, ow: Overworld, species: SpeciesId, level: number, o: WildOptions = {}): Promise<Outcome> {
  const save = s.save
  if (healthyCount(save) === 0) return 'fled'
  const rng = new Rng(nextSeed(save))
  const foe = createCreature(species, level, rng, { metPlace: ow.map.def.name, shiny: o.shiny })
  markSeen(save, species)
  const end = await runBattle(game, save, {
    setup: { kind: 'wild', foes: [foe], dark: !!ow.map.def.dark, noRun: o.noRun },
    pres: { bg: ow.player.surfing ? 'water' : ow.map.def.bg, music: o.music ?? 'battleWild', victory: 'victoryWild' },
    wipe: 'bars',
  })
  await afterBattle(game, s, ow, end, false)
  return end.outcome
}

function fixedIvs(v: number) {
  return { hp: v, atk: v, def: v, spa: v, spd: v, spe: v }
}

// ─── START menu ─────────────────────────────────────────────────────────

async function startMenu(game: Game, s: ScriptCtx): Promise<void> {
  const save = s.save
  for (;;) {
    const choice = await game.run(new StartMenu(game, save))
    if (!choice) return
    switch (choice) {
      case 'dex':
        game.audio.sfx('dexOpen')
        await game.run(new DexScene(game, save))
        break
      case 'party':
        await partyMenu(game, save)
        break
      case 'bag': {
        const done = await bagMenu(game, s)
        if (done) return
        break
      }
      case 'card':
        await game.run(new TrainerCard(game, save))
        break
      case 'save':
        if (await saveFlow(game, save)) return
        break
      case 'options':
        await game.run(new OptionsScene(game))
        save.options = { ...game.options }
        break
    }
  }
}

async function partyMenu(game: Game, save: SaveData): Promise<void> {
  const scene = new PartyScene(game, save.party, 'field', undefined, async (i) => {
    const pick = await game.choose(['SUMMARY', 'SWITCH', 'CANCEL'], { y: 128 - 60 })
    if (pick === 0) {
      await game.run(new SummaryScene(game, save.party, i, undefined, { name: save.name, id: save.trainerId }))
      return null
    }
    return pick === 1 ? 'switch' : null
  })
  await game.run(scene)
}

/** Returns true when an item use should close the START menu (surfing, fishing, escaping). */
async function bagMenu(game: Game, s: ScriptCtx): Promise<boolean> {
  const save = s.save
  const ow = currentOverworld(game)
  for (;;) {
    const id = await game.run(new BagScene(game, save, 'field'))
    if (!id) return false
    const data = item(id)
    const options = data.pocket === 'key' ? ['USE', 'CANCEL'] : ['USE', 'TOSS', 'CANCEL']
    const pick = await game.choose(options, { prompt: `${data.name} is selected.` })
    if (options[pick] === 'CANCEL') continue
    if (options[pick] === 'TOSS') {
      const n = save.bag[id] ?? 0
      if (await game.ask(`Throw away all ${n} ${data.name}?`)) {
        removeItem(save, id, n)
        await game.say(`Threw away ${n} ${data.name}.`)
      }
      continue
    }
    const use = data.use
    switch (use.kind) {
      case 'heal':
      case 'cure':
      case 'revive':
      case 'pp': {
        const r = await game.run(new PartyScene(game, save.party, 'item'))
        if (!r) break
        const c = save.party[r.index]
        const res = useItemInField(c, id)
        if (res.ok) {
          removeItem(save, id)
          game.audio.sfx('heal')
        }
        await game.say(res.text)
        break
      }
      case 'repel':
        removeItem(save, id)
        save.repel = use.steps
        game.audio.sfx('heal')
        await game.say(`${save.name} used the ${data.name}. Weak wild beasts will keep away.`)
        break
      case 'escape':
        if (ow && ow.map.def.escape) {
          removeItem(save, id)
          const e = ow.map.def.escape
          await game.say(`${save.name} used the ${data.name}!`)
          await ow.warp(e.map, e.x, e.y, 'down', 'stairs')
          return true
        }
        await game.say("There's no need to use that here.")
        break
      case 'orb':
        await game.say("There's no wild beast to throw it at!")
        break
      case 'key':
        if (id === 'driftRod' && ow) {
          if (ow.facingWater() && !ow.player.surfing) {
            await ow.fish(s)
            return true
          }
          await game.say("There's no water to fish in here.")
        } else if (id === 'tideCharm' && ow) {
          const surfer = ow.canSurf()
          if (ow.facingWater() && surfer && !ow.player.surfing) {
            await ow.startSurf(s)
            return true
          }
          await game.say(surfer ? 'Face the water and use it to ride the waves.' : 'You need a TIDE beast who can carry you.')
        } else await game.say(data.desc)
        break
    }
  }
}

async function saveFlow(game: Game, save: SaveData): Promise<boolean> {
  const info = `${save.name}  CRESTS ${save.crests.length}  BEASTIARY ${save.caught.length}  TIME ${playTime(save.playSeconds)}`
  const yes = await game.ask(`Would you like to save the game?\n${info}`)
  if (!yes) return false
  await game.say('Saving… please wait.', { speed: 0 })
  const ok = writeGame(save)
  await game.audio.playJingle('save')
  await game.say(ok ? `${save.name} saved the game.` : "The game couldn't be saved on this device.")
  return true
}
