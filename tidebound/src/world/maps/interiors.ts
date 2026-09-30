import type { TrackId } from '../../audio/api'
import type { MapDef, NpcDef } from '../mapTypes'
import { PEOPLE } from '../people'
import type { Script } from '../script'

/**
 * Rooms that repeat from town to town: the Haven, the Market and ordinary
 * homes. Each takes the door it leads back out to.
 */
export interface Exit {
  map: string
  x: number
  y: number
}

/** A standard home. The doormat is at (4, 7). */
export function house(id: string, name: string, exit: Exit, npcs: NpcDef[], o: { music?: TrackId; rows?: string[] } = {}): MapDef {
  return {
    id,
    name,
    music: o.music ?? 'home',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: o.rows ?? ['HHhHHHhHH', 'HHHHHHHHH', 'KxxxVxxxY', 'xxxxxxxxx', 'xxttxxxxx', 'xxttxxxxx', 'Yxxxxxxxx', 'xxxxmxxxx'],
    warps: [{ x: 4, y: 7, to: exit.map, tx: exit.x, ty: exit.y, face: 'down' }],
    npcs,
  }
}

export const HAVEN_MAT = { x: 5, y: 8 }

/** A Haven: the keeper heals your party, and the PC holds your stored beasts. */
export function haven(id: string, townName: string, exit: Exit, extra: NpcDef[] = []): MapDef {
  return {
    id,
    name: townName,
    music: 'haven',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: ['HHhHHHHHhHH', 'HHHHHHHHHHH', 'YXXX+X+XXXQ', 'XXXcccccXXX', 'XXXXXXXXXXX', 'XXXXXXXXXXX', 'tXXXXXXXXXt', 'YXXXXXXXXXY', 'XXXXXmXXXXX'],
    warps: [{ x: 5, y: 8, to: exit.map, tx: exit.x, ty: exit.y, face: 'down' }],
    haven: { x: 5, y: 4 },
    npcs: [{ id: 'keeper', x: 5, y: 2, face: 'down', look: PEOPLE.keeper, script: havenKeeper }, ...extra],
  }
}

export const havenKeeper: Script = async (s) => {
  await s.say('Welcome to the HAVEN!\fWe rest tired beasts back to full health, free of charge.')
  const yes = await s.ask('Shall I take care of your beasts?')
  if (!yes) {
    await s.say('Come back any time. Fair winds!')
    return
  }
  await s.say('Let me have your beasts for a moment…')
  s.heal()
  s.game.audio.stopMusic(0.2)
  await s.jingle('heal')
  s.game.audio.playMusic('haven')
  s.save.lastHaven = { map: s.save.map, x: 5, y: 4 }
  await s.say('All done! Your beasts are rested and happy.\fFair winds, and come back any time!')
}

/** A Market: the clerk behind the counter sells `stock`. */
export function market(id: string, townName: string, exit: Exit, stock: MarketStock, extra: NpcDef[] = []): MapDef {
  return {
    id,
    name: townName,
    music: 'city',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: ['HHhHHHHhH', 'HHHHHHHHH', 'xYxxsssxs', 'xcxxxxxxx', 'xcxxsssxs', 'xxxxxxxxx', 'Yxxxsssxs', 'xxxxmxxxx'],
    warps: [{ x: 4, y: 7, to: exit.map, tx: exit.x, ty: exit.y, face: 'down' }],
    npcs: [{ id: 'clerk', x: 0, y: 3, face: 'right', look: PEOPLE.clerk, script: (s) => marketHooks.shop(s, stock) }, ...extra],
  }
}

export type MarketStock = readonly import('../../data/items').ItemId[]

/** Filled in at boot, like overworldHooks. */
export const marketHooks = {
  shop: async (_s: Parameters<Script>[0], _stock: MarketStock): Promise<void> => {},
}
