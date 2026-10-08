import type { MapDef } from '../mapTypes'
import { PEOPLE } from '../people'
import { haven, house, market } from './interiors'

export const ROUTE1_MAPS: MapDef[] = [
  {
    id: 'route1',
    name: 'ROUTE 1',
    music: 'route',
    bg: 'grass',
    border: 'tree',
    rows: [
      'TTTTTTTTTTT..TTTTTTTTTTT',
      'TTTTTTTTTT....TTTTTTTTTT',
      'TTT,,,,,.......,,,,,TTTT',
      'TTT,,,,,,......,,,,,,TTT',
      'TTT,,,,..........,,,,TTT',
      'TT........TT..........TT',
      'TT..o.....TT....~~~~..TT',
      'TTvvvvvv..TT...~~~~~~.TT',
      'TT........TT...~~~~~~.TT',
      'TT,,,,,........~~~~~..TT',
      'TT,,,,,,.......,,.....TT',
      'TT,,,,,,......,,,,,...TT',
      'TT....vvvvvvv.,,,,,...TT',
      'TT..............,,....TT',
      'TTTTTTT.....TTTTTT.bb.TT',
      'TT,,,,,.....TTTTTT....TT',
      'TT,,,,,,..............TT',
      'TT,,,,,,,,......,,,,..TT',
      'TT...,,,,,.....,,,,,,.TT',
      'TT..........*..,,,,,,.TT',
      'TTvvvvvvvvv..vvvvvvvvvTT',
      'TT....*...........*...TT',
      'TT..TT....,,,,....TT..TT',
      'TT..TT...,,,,,,...TT..TT',
      'TT.......,,,,,,.......TT',
      'TT.S.......,,.........TT',
      'TT....................TT',
      'TTTTTTTTTT....TTTTTTTTTT',
      'TTTTTTTTTTT..TTTTTTTTTTT',
      'TTTTTTTTTTT..TTTTTTTTTTT',
    ],
    connections: { south: { map: 'driftwood', offset: 0 }, north: { map: 'mossgrove', offset: -1 } },
    signs: [{ x: 3, y: 25, text: 'ROUTE 1\n↑ MOSSGROVE   ↓ DRIFTWOOD' }],
    items: [
      { id: 'r1orb', x: 20, y: 21, item: 'orb', qty: 2 },
      { id: 'r1salve', x: 2, y: 10, item: 'reefBerry', qty: 2 },
      { id: 'r1spray', x: 19, y: 2, item: 'muskSpray' },
    ],
    npcs: [
      {
        id: 'boy',
        x: 9,
        y: 24,
        face: 'left',
        move: 'look',
        look: PEOPLE.boy,
        text: 'Wild beasts jump out when you walk through tall grass!\fIf your beasts get tired, rest them at a HAVEN. MOSSGROVE has one.',
      },
      {
        id: 'lass',
        x: 17,
        y: 13,
        face: 'left',
        move: 'wander',
        look: PEOPLE.lass,
        text: "See those little ledges? You can hop down them, but you can't climb back up. Plan your route!",
      },
    ],
    encounters: {
      grass: {
        rate: 12,
        slots: [
          { species: 'tubbara', min: 2, max: 4, weight: 40 },
          { species: 'pufflet', min: 2, max: 4, weight: 35 },
          { species: 'twigling', min: 2, max: 3, weight: 25 },
        ],
      },
      water: { rate: 8, slots: [{ species: 'dugling', min: 5, max: 8, weight: 100 }] },
      fish: {
        rate: 70,
        slots: [
          { species: 'spinefin', min: 5, max: 8, weight: 60 },
          { species: 'dugling', min: 5, max: 8, weight: 40 },
        ],
      },
    },
  },
  {
    id: 'mossgrove',
    name: 'MOSSGROVE',
    music: 'town',
    bg: 'grass',
    border: 'tree',
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TT......................TT',
      'TT..........*...........TT',
      'TT.........***..........TT',
      'TT..........*...........TT',
      'TT......................TT',
      'TT.=======================',
      'TT..........==..........==',
      'TT..........==..........TT',
      'TT..........==..........TT',
      'TT..........==..........TT',
      'TT..........==..........TT',
      'TT..........==..........TT',
      'TT..........==..........TT',
      'TT...=========..........TT',
      'TT..........=======.....TT',
      'TT.........S==..........TT',
      'TT..**......==......**..TT',
      'TT..........==..........TT',
      'TTTTTTTTTTTT..TTTTTTTTTTTT',
      'TTTTTTTTTTTT..TTTTTTTTTTTT',
    ],
    connections: { south: { map: 'route1', offset: 1 }, east: { map: 'route2', offset: 0 } },
    buildings: [
      { kind: 'haven', x: 3, y: 2, to: { map: 'mossgrove_haven', x: 5, y: 8 } },
      { kind: 'market', x: 15, y: 3, to: { map: 'mossgrove_market', x: 4, y: 7 } },
      { kind: 'house', x: 3, y: 11, variant: 2, to: { map: 'mossgrove_house1', x: 4, y: 7 } },
      { kind: 'house', x: 16, y: 12, variant: 3, to: { map: 'mossgrove_house2', x: 4, y: 7 } },
    ],
    signs: [{ x: 11, y: 17, text: 'MOSSGROVE\nA quiet village in the whispering woods.' }],
    npcs: [
      {
        id: 'woman',
        x: 9,
        y: 10,
        face: 'down',
        move: 'wander',
        look: PEOPLE.woman,
        text: "Our HAVEN heals beasts for free. The keeper never seems to sleep. I've checked!",
      },
      {
        id: 'oldman',
        x: 21,
        y: 9,
        face: 'left',
        move: 'look',
        look: PEOPLE.oldWoman,
        text: 'East of here is ROUTE 2, and then GLIMMER CAVE. The larvae inside glow like stars.\fBASALT TOWN is on the far side of the cave.',
      },
      {
        id: 'grunt1',
        x: 17,
        y: 7,
        face: 'up',
        look: PEOPLE.grunt,
        when: (sv) => !sv.flags.gruntFled,
        script: async (s) => {
          await s.say("Oi! That crate of salvage washed up on OUR beach, so it's OURS.\fThe TIDEWRACK CREW takes whatever the sea gives! You got a problem with that?")
          const won = await s.battle({
            id: 'grunt1',
            className: 'CREW GRUNT',
            name: 'BILGE',
            party: [
              { species: 'murkeel', level: 6 },
              { species: 'tatterling', level: 6 },
            ],
            prize: 20,
            intro: '',
            lose: 'Blast! Beaten by a kid with a brand-new beast!',
            after: '',
          })
          if (!won) return
          const g = s.npc('grunt1')
          await s.say("Tch! Fine, keep your soggy crate!\fThe CAPTAIN's got bigger plans than this anyway. You'll see!")
          await s.walk(g, 'r8', true)
          s.hide(g)
          s.setFlag('gruntFled')
        },
      },
    ],
  },
  haven('mossgrove_haven', 'MOSSGROVE', { map: 'mossgrove', x: 6, y: 6 }, [
    {
      id: 'camper',
      x: 2,
      y: 5,
      face: 'right',
      move: 'look',
      look: PEOPLE.camper,
      text: 'That PC in the corner stores beasts. You can only carry six at once, so the rest wait in there.',
    },
  ]),
  market('mossgrove_market', 'MOSSGROVE', { map: 'mossgrove', x: 17, y: 6 }, ['orb', 'salve', 'remedy', 'reefBerry', 'muskSpray'], [
    {
      id: 'shopper',
      x: 6,
      y: 5,
      face: 'left',
      move: 'wander',
      look: PEOPLE.picnicker,
      script: async (s) => {
        if (s.flag('beat:grunt1')) await s.say('You chased off that CREW grunt? Wow! The clerk was so relieved.')
        else await s.say("There's a scary man blocking the door… I've been stuck in here for an hour!")
      },
    },
  ]),
  house('mossgrove_house1', 'MOSSGROVE', { map: 'mossgrove', x: 5, y: 14 }, [
    {
      id: 'kid',
      x: 5,
      y: 4,
      face: 'down',
      move: 'wander',
      look: PEOPLE.youngster,
      text: "My big sister says beasts get stronger when they fight, and some even change shape!\fShe calls it EVOLVING. I call it AWESOME.",
    },
  ]),
  house('mossgrove_house2', 'MOSSGROVE', { map: 'mossgrove', x: 18, y: 15 }, [
    {
      id: 'granny',
      x: 5,
      y: 4,
      face: 'left',
      look: PEOPLE.oldWoman,
      script: async (s) => {
        if (s.flag('grannyGift')) {
          await s.say('A SALVE a day keeps the fainting away. That\'s what I always say!')
          return
        }
        await s.say("Oh, a young trainer! You remind me of my grandson. Here, dear, take this for the road.")
        s.setFlag('grannyGift')
        await s.give('salve', 3)
      },
    },
  ]),
]
