/**
 * Interiors every town shares — the CLINIC, the SHOP, plain houses — and the
 * scripts of the people who work in them.
 */
import type { ItemId } from '../../data/items'
import { ShopScene } from '../../scenes/ShopScene'
import type { TrackId } from '../../audio/api'
import type { MapDef, NpcDef } from '../mapTypes'
import type { Script } from '../script'

export interface Door {
  map: string
  x: number
  y: number
}

/** The nurse at the counter heals the party and remembers this CLINIC for blackouts. */
export function nurse(clinicId: string): Script {
  return async (s) => {
    await s.say('Hello, and welcome to the CRITTER CLINIC!')
    if (!s.save.party.length) {
      await s.say("Bring your critters by whenever they're feeling worn out.")
      return
    }
    if (!(await s.ask('Shall I give your critters a rest?'))) {
      await s.say('Come back any time!')
      return
    }
    await s.say("I'll take them for a moment.")
    s.face('nurse', 'left')
    await s.wait(16)
    await s.heal()
    s.face('nurse', 'down')
    s.save.heal = { map: clinicId, x: 4, y: 4 }
    await s.say("All done! Your critters are bright-eyed and bouncy again.")
    await s.say('Take care out there!')
  }
}

/** The SHOP clerk sells `stock`. */
export function clerk(stock: readonly ItemId[]): Script {
  return async (s) => {
    await s.game.run(new ShopScene(s.game, s.save, stock))
  }
}

const CLINIC_ROWS = ['HHnHHHHnHH', 'xxxxxxxxxx', 'Yccc+cccxQ', 'xxxxxxxxxx', 'xxxxxxxxxx', 'xRRxxxxRRx', 'xxxxxxxxxx', 'xxxxmxxxxx']

/** A CLINIC interior whose doormat leads back to `out`. */
export function clinic(id: string, name: string, out: Door, extra: NpcDef[] = []): MapDef {
  return {
    id,
    name,
    kind: 'indoor',
    music: 'clinic',
    border: 'void',
    rows: CLINIC_ROWS,
    bg: 'indoor',
    clinic: { x: 4, y: 4 },
    warps: [{ x: 4, y: 7, to: out.map, tx: out.x, ty: out.y, face: 'down' }],
    npcs: [{ id: 'nurse', x: 4, y: 1, face: 'down', look: 'nurse', script: nurse(id) }, ...extra],
  }
}

const SHOP_ROWS = ['HHnHHHnH', 'xxxxxsss', 'xxxxxxxx', 'xcxxxxxx', 'xcxxxsss', 'xxxxxxxx', 'xxxxxsss', 'xxxmxxxx']

/** A SHOP interior with a clerk behind the counter. */
export function shop(id: string, name: string, out: Door, stock: readonly ItemId[], extra: NpcDef[] = []): MapDef {
  return {
    id,
    name,
    kind: 'indoor',
    music: 'town',
    border: 'void',
    rows: SHOP_ROWS,
    bg: 'indoor',
    warps: [{ x: 3, y: 7, to: out.map, tx: out.x, ty: out.y, face: 'down' }],
    npcs: [{ id: 'clerk', x: 0, y: 3, face: 'right', look: 'clerk', script: clerk(stock) }, ...extra],
  }
}

const HOUSE_ROWS = ['HHnHHnHH', 'KKxxxxVx', 'xxxxxxxx', 'xxxttxxx', 'xxxttxxx', 'xxxxxxxx', 'Yxxxxxxx', 'xxxmxxxx']

/** A plain house with whoever lives there. */
export function house(id: string, name: string, out: Door, npcs: NpcDef[], music: TrackId = 'town', rows = HOUSE_ROWS): MapDef {
  return {
    id,
    name,
    kind: 'indoor',
    music,
    border: 'void',
    rows,
    bg: 'indoor',
    warps: [{ x: 3, y: 7, to: out.map, tx: out.x, ty: out.y, face: 'down' }],
    npcs,
  }
}

/** Shop stock as the game goes on. */
export const STOCK = {
  early: ['capsule', 'tonic', 'antidote', 'nerveSalve', 'wakeBell', 'shooSpray'],
  mid: ['capsule', 'fineCapsule', 'tonic', 'superTonic', 'antidote', 'burnSalve', 'nerveSalve', 'wakeBell', 'thawSalt', 'shooSpray', 'exitCord'],
  late: ['fineCapsule', 'primeCapsule', 'superTonic', 'hyperTonic', 'reviver', 'cureAll', 'superShoo', 'exitCord'],
  end: ['primeCapsule', 'hyperTonic', 'fullTonic', 'fullCure', 'reviver', 'cureAll', 'maxShoo', 'exitCord'],
} satisfies Record<string, ItemId[]>
