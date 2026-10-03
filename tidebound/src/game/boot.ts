import { createCreature } from '../battle/creature'
import { Rng } from '../core/rng'
import { SPECIES_IDS, type SpeciesId } from '../data/dex'
import { ITEM_IDS, type ItemId } from '../data/items'
import { IntroScene } from '../scenes/IntroScene'
import { OptionsScene } from '../scenes/OptionsScene'
import { TitleScene } from '../scenes/TitleScene'
import { isIOS, isStandalone, isTouchDevice } from '../engine/platform'
import { MAPS } from '../world/maps'
import { Overworld } from '../world/Overworld'
import { installFieldHooks, setCurrentOverworld } from './field'
import { warmUpCreatures } from './art'
import { endingHooks } from '../world/maps/beacon'
import type { Game } from './Game'
import { addItem, hasSave, loadGame, loadOptions, markCaught, newGame, writeOptions, type SaveData } from './state'

/**
 * From power-on to play: the title screen, then either the professor's
 * welcome for a new game or straight back to where the save left off.
 *
 * For testing, the URL can skip ahead: `?quick` starts a new game at once,
 * with `&at=map,x,y`, `&party=kindlet:12,zappet:8`, `&items=orb:10`,
 * `&flags=gotStarter,dex`, `&crests=crag,spark` and `&money=500`.
 */
export async function boot(game: Game): Promise<void> {
  installFieldHooks(game)
  game.options = loadOptions()
  applyOptions(game)
  const params = new URLSearchParams(location.search)
  if (params.has('quick')) {
    startGame(game, quickSave(params))
    return
  }
  await titleLoop(game)
}

export function applyOptions(game: Game): void {
  game.gfx.frameStyle = game.options.frame
  game.audio.setVolumes(game.options.music, game.options.sfx)
}

export async function titleLoop(game: Game): Promise<void> {
  const title = new TitleScene(game, { touch: isTouchDevice(), install: isIOS() && !isStandalone() })
  game.setFade(1)
  game.reset(title)
  await game.fadeIn(24)
  let menu = false
  for (;;) {
    const choice = await title.choose(menu)
    menu = true
    if (choice === 'options') {
      await game.run(new OptionsScene(game))
      writeOptions(game.options)
      continue
    }
    if (choice === 'continue') {
      const save = loadGame()
      if (!save) {
        await game.say("The saved game couldn't be read.")
        continue
      }
      await game.fadeOut(20)
      startGame(game, save)
      return
    }
    // The game saves by itself, so a new game soon replaces the old one.
    if (hasSave() && !(await game.ask('Start a new game? It will replace your saved game.', { careful: true }))) continue
    await game.fadeOut(24)
    game.audio.stopMusic(0.5)
    const intro = new IntroScene(game)
    game.reset(intro)
    const { name, lookIndex } = await intro.play()
    const save = newGame(name, lookIndex, (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)
    save.options = { ...game.options }
    startGame(game, save)
    return
  }
}

export function startGame(game: Game, save: SaveData): void {
  game.save = save
  game.options = { ...save.options }
  applyOptions(game)
  const ow = new Overworld(game, save, MAPS)
  setCurrentOverworld(ow)
  // A handle for automated play-testing (dev builds, or ?quick test starts).
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('quick'))
    (window as unknown as { __tb: unknown }).__tb = { game, ow, save, credits: endingHooks.credits }
  game.setFade(1)
  game.reset(ow)
  void game.fadeIn(24)
  const local = Object.values(MAPS.get(save.map)?.encounters ?? {}).flatMap((t) => t?.slots.map((sl) => sl.species) ?? [])
  warmUpCreatures(SPECIES_IDS, [...save.party.map((c) => c.species), ...local])
}

function quickSave(params: URLSearchParams): SaveData {
  const seed = Number(params.get('seed')) || 12345
  const save = newGame(params.get('name') ?? 'KAI', Number(params.get('look')) || 0, seed)
  const at = params.get('at')?.split(',')
  if (at && at.length >= 3 && MAPS.has(at[0])) {
    save.map = at[0]
    save.x = Number(at[1])
    save.y = Number(at[2])
  }
  const rng = new Rng(seed)
  for (const part of (params.get('party') ?? '').split(',').filter(Boolean)) {
    const [id, lv] = part.split(':')
    if (!(SPECIES_IDS as readonly string[]).includes(id)) continue
    save.party.push(createCreature(id as SpeciesId, Number(lv) || 5, rng, { ot: save.name, metPlace: 'DRIFTWOOD' }))
    markCaught(save, id as SpeciesId)
  }
  for (const part of (params.get('items') ?? '').split(',').filter(Boolean)) {
    const [id, n] = part.split(':')
    if ((ITEM_IDS as readonly string[]).includes(id)) addItem(save, id as ItemId, Number(n) || 1)
  }
  for (const f of (params.get('flags') ?? '').split(',').filter(Boolean)) save.flags[f] = true
  for (const c of (params.get('crests') ?? '').split(',').filter(Boolean)) save.crests.push(c)
  if (params.has('money')) save.money = Number(params.get('money')) || 0
  if (save.party.length) {
    save.flags.momShoes = true
    save.flags.labIntro = true
    save.flags.gotStarter = true
    save.flags.rivalPicked = true
    save.flags.labDone = true
    save.flags.dex = true
    addItem(save, 'sprintShoes')
  }
  return save
}
