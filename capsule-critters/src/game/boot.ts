import { Rng } from '../core/rng'
import { makeCritter } from '../battle/creature'
import { isItemId, type ItemId } from '../data/items'
import { isSpeciesId } from '../data/species'
import { makeWorld } from '../world/maps'
import { Overworld } from '../world/Overworld'
import { IntroScene } from '../scenes/IntroScene'
import { OptionsScene } from '../scenes/OptionsScene'
import { TitleScene } from '../scenes/TitleScene'
import { installHooks, setOverworld } from './field'
import type { Game } from './Game'
import { addItem, hasGame, markCaught, newSave, readGame, readOptions, type SaveData } from './state'

const WORLD = makeWorld()

/** Starts play from a save: the overworld, faded in. */
export function enterWorld(game: Game, save: SaveData): Overworld {
  game.save = save
  game.options = { ...save.options }
  game.audio.setVolumes(game.options.music, game.options.sfx)
  if (!WORLD.has(save.at.map)) save.at = { ...save.heal }
  const ow = new Overworld(game, save, WORLD)
  setOverworld(ow)
  game.setFade(3)
  game.reset(ow)
  void game.fadeIn()
  return ow
}

/**
 * A test start from the URL: `?quick` skips the title and intro;
 * `&party=pandle:12,rooklet:5` `&items=capsule:10` `&at=route1,9,20`
 * `&flags=gotStarter,gotAlmanac` `&medals=1,2` set things up.
 */
function quickSave(params: URLSearchParams): SaveData {
  const s = newSave('ORION', 'VANCE', 12345)
  const rng = new Rng(7)
  const party = params.get('party')
  for (const part of (party ?? 'pandle:5').split(',')) {
    const [id, lv] = part.split(':')
    if (!isSpeciesId(id)) continue
    const c = makeCritter(id, Number(lv) || 5, { rng, ot: s.name, otId: s.id, metPlace: 'FARTHING TOWN' })
    s.party.push(c)
    markCaught(s, id)
  }
  s.starter = s.party[0]?.species ?? null
  for (const part of (params.get('items') ?? 'capsule:5,tonic:3').split(',')) {
    const [id, n] = part.split(':')
    if (isItemId(id)) addItem(s, id as ItemId, Number(n) || 1)
  }
  for (const f of (params.get('flags') ?? 'profAsked,gotStarter,rival1,gotAlmanac').split(',')) if (f) s.flags[f] = true
  for (const m of (params.get('medals') ?? '').split(',')) if (Number(m)) s.medals.push(Number(m))
  const at = params.get('at')
  if (at) {
    const [map, x, y] = at.split(',')
    s.at = { map, x: Number(x), y: Number(y) }
  } else s.at = { map: 'farthing', x: 10, y: 15 }
  return s
}

export async function boot(game: Game): Promise<void> {
  installHooks()
  game.options = readOptions()
  game.audio.setVolumes(game.options.music, game.options.sfx)
  const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
  if (params.has('quick')) {
    enterWorld(game, quickSave(params))
    return
  }
  for (;;) {
    const title = new TitleScene(game, hasGame())
    game.reset(title)
    const choice = await new Promise<string>((resolve) => title.bind(resolve))
    if (choice === 'options') {
      await game.run(new OptionsScene(game))
      continue
    }
    if (choice === 'continue') {
      const save = readGame()
      if (save) {
        game.audio.stopMusic(0.5)
        await game.fadeOut()
        enterWorld(game, save)
        return
      }
      continue
    }
    game.audio.stopMusic(0.5)
    await game.fadeOut()
    game.reset(new (class extends TitleScene {})(game, false))
    const intro = new IntroScene(game)
    game.reset(intro)
    const r = await new Promise<{ name: string; rival: string }>((resolve) => intro.bind(resolve))
    const save = newSave(r.name, r.rival)
    save.options = { ...game.options }
    enterWorld(game, save)
    return
  }
}
