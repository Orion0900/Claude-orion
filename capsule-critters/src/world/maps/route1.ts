/**
 * ROUTE 1 and PENNYWORTH TOWN: the first steps out of FARTHING.
 */
import type { MapDef } from '../mapTypes'
import { clinic, house, shop, STOCK } from './common'
import { Paint } from './paint'

function route1(): MapDef {
  const p = new Paint(20, 30, 'T')
  p.rect(2, 0, 16, 30, '.')
  // The path wanders north.
  p.rect(9, 26, 2, 4, '=')
  p.rect(9, 20, 2, 7, '=')
  p.hline(5, 20, 6, '=')
  p.rect(5, 12, 2, 9, '=')
  p.hline(5, 12, 8, '=')
  p.rect(11, 4, 2, 9, '=')
  p.hline(9, 4, 4, '=')
  p.rect(9, 0, 2, 5, '=')
  // Tall grass.
  p.rect(12, 21, 5, 6, ',')
  p.rect(3, 22, 4, 5, ',')
  p.rect(8, 13, 3, 6, ',')
  p.rect(13, 7, 4, 7, ',')
  p.rect(3, 3, 5, 6, ',')
  // Ledges to hop down on the way home.
  p.hline(2, 18, 3, 'v')
  p.hline(12, 18, 6, 'v')
  p.hline(2, 10, 3, 'v')
  p.hline(14, 15, 4, 'v')
  // A few trees and flowers in the open.
  p.set(15, 3, 'T').set(16, 3, 'T').set(7, 15, 'T').set(3, 15, 'T')
  p.paste(14, 1, ['**', '*.'])
  p.set(8, 27, 'S')
  return {
    id: 'route1',
    name: 'ROUTE 1',
    kind: 'route',
    music: 'route1',
    border: 'tree',
    rows: p.rows(),
    connections: { south: { map: 'farthing', offset: 0 }, north: { map: 'pennyworth', offset: 0 } },
    signs: [{ x: 8, y: 27, text: 'ROUTE 1\n↑ PENNYWORTH TOWN\n↓ FARTHING TOWN' }],
    items: [
      { id: 'r1capsule', x: 16, y: 1, item: 'capsule', qty: 2 },
      { id: 'r1tonic', x: 3, y: 12, item: 'tonic' },
      { id: 'r1hidden', x: 17, y: 25, item: 'antidote', hidden: true },
    ],
    npcs: [
      {
        id: 'tipster',
        x: 7,
        y: 21,
        face: 'right',
        move: 'look',
        look: 'youngster',
        text: 'Wear a wild critter down before you throw a CAPSULE. A tired critter is much easier to catch!',
      },
      {
        id: 'bram',
        x: 14,
        y: 5,
        face: 'left',
        look: 'youngster',
        sight: 3,
        trainer: {
          id: 'r1bram',
          className: 'YOUNGSTER',
          name: 'BRAM',
          party: [{ species: 'rooklet', level: 3 }],
          prize: 15,
          intro: 'Hey! You walked right past me! That means we battle!',
          lose: 'Aww, my ROOKLET!',
          after: 'I just caught it this morning. We need more practice.',
        },
      },
      {
        id: 'walker',
        x: 12,
        y: 24,
        move: 'wander',
        look: 'man',
        text: 'Ledges are a one-way trip. You can hop down, but you can\'t climb back up!',
      },
    ],
    encounters: {
      grass: {
        rate: 14,
        slots: [
          { species: 'rooklet', min: 2, max: 4, weight: 45 },
          { species: 'marmlet', min: 2, max: 4, weight: 45 },
          { species: 'spudling', min: 3, max: 4, weight: 10 },
        ],
      },
    },
  }
}

function pennyworth(): MapDef {
  const p = new Paint(20, 18, 'T')
  p.rect(2, 2, 16, 14, '.')
  p.rect(9, 0, 2, 18, '=')
  p.hline(2, 7, 16, '=')
  p.hline(4, 14, 6, '=')
  p.hline(10, 15, 6, '=')
  p.set(7, 8, 'S').set(11, 16, 'S')
  p.paste(2, 8, ['*..', '.*.'])
  p.paste(16, 2, ['**'])
  p.hline(12, 9, 6, 'f')
  return {
    id: 'pennyworth',
    name: 'PENNYWORTH',
    kind: 'town',
    music: 'town',
    border: 'tree',
    rows: p.rows(),
    soar: { x: 4, y: 8 },
    palette: { 3: 'roofGreen' },
    connections: { south: { map: 'route1', offset: 0 }, north: { map: 'route2', offset: 0 } },
    buildings: [
      { kind: 'clinic', x: 2, y: 3, to: { map: 'pennyClinic', x: 4, y: 6 } },
      { kind: 'shop', x: 13, y: 3, to: { map: 'pennyShop', x: 3, y: 6 } },
      { kind: 'house', x: 3, y: 10, to: { map: 'pennyHouse', x: 3, y: 6 } },
      { kind: 'arena', x: 12, y: 10, locked: 'The door is locked tight. A note reads: "Out prospecting. Back someday. -OSWIN"' },
    ],
    signs: [
      { x: 7, y: 8, text: 'PENNYWORTH\nSmall change, big hearts.' },
      { x: 11, y: 16, text: 'PENNYWORTH ARENA\nMASTER: OSWIN\nThe digger who never stops.' },
    ],
    npcs: [
      {
        id: 'oldman',
        x: 6,
        y: 11,
        face: 'down',
        move: 'look',
        look: 'oldMan',
        text: "The CLINIC heals your critters for free. The red roof with the heart! You can't miss it.",
      },
      {
        id: 'kid',
        x: 14,
        y: 8,
        move: 'wander',
        look: 'boy',
        text: 'The ARENA MASTER here went off digging for treasure ages ago. Nobody knows when he\'ll be back.',
      },
      {
        id: 'lass',
        x: 10,
        y: 4,
        face: 'down',
        look: 'lass',
        text: 'North of town is ROUTE 2, and past that the WHISPERWOOD. It\'s crawling with bugs!',
      },
    ],
  }
}

export const ROUTE1_MAPS: MapDef[] = [
  route1(),
  pennyworth(),
  clinic('pennyClinic', 'PENNYWORTH', { map: 'pennyworth', x: 4, y: 7 }, [
    { id: 'visitor', x: 7, y: 5, move: 'wander', look: 'woman', text: 'Critters that faint are brought here by their trainers. The nurse fixes them right up.' },
  ]),
  shop('pennyShop', 'PENNYWORTH', { map: 'pennyworth', x: 15, y: 7 }, STOCK.early, [
    { id: 'shopper', x: 5, y: 5, move: 'wander', look: 'boy', text: 'A SHOO SPRAY keeps weak wild critters away for a while. Handy when you just want to get somewhere!' },
  ]),
  house('pennyHouse', 'PENNYWORTH', { map: 'pennyworth', x: 4, y: 14 }, [
    { id: 'gran', x: 2, y: 3, face: 'right', look: 'oldWoman', text: 'Critters are like family. Feed them, rest them, and they\'ll follow you anywhere.' },
    { id: 'grandkid', x: 5, y: 5, move: 'wander', look: 'youngster', text: 'Grandma says a critter that trusts you fights twice as hard!' },
  ]),
]
