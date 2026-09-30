import type { MapDef } from '../mapTypes'
import { PEOPLE } from '../people'
import { haven, house, market } from './interiors'
import { Paint } from './paint'

function lagoonaRows(): string[] {
  const p = new Paint(34, 28, '~')
  // Land along the south and east; the lagoon fills the middle.
  p.rect(0, 18, 34, 10, '.')
  p.rect(24, 4, 10, 14, '.')
  p.rect(0, 16, 24, 2, ':')
  p.rect(22, 4, 2, 12, ':')
  p.rect(24, 2, 10, 2, ':')
  // Stilt walkways out over the lagoon.
  p.rect(4, 8, 16, 1, 'p')
  p.rect(4, 8, 1, 8, 'p')
  p.rect(12, 8, 1, 8, 'p')
  p.rect(19, 8, 3, 1, 'p')
  p.rect(3, 4, 5, 4, 'p')
  p.rect(11, 4, 5, 4, 'p')
  // Paths on land.
  p.rect(0, 24, 34, 1, '=')
  p.rect(29, 10, 1, 14, '=')
  p.rect(18, 18, 1, 6, '=')
  p.rect(9, 18, 1, 6, '=')
  // Trees along the south edge, palms and a patch of grass.
  p.rect(0, 26, 34, 2, 'T')
  p.set(1, 19, 'P').set(31, 12, 'P').set(26, 19, 'P').set(11, 19, 'P').set(22, 19, 'P')
  p.rect(30, 18, 3, 3, ',')
  p.set(1, 21, 'S').set(27, 10, 'S')
  return p.rows()
}

export const LAGOONA_MAPS: MapDef[] = [
  {
    id: 'lagoona',
    name: 'LAGOONA',
    music: 'town',
    bg: 'beach',
    border: 'water',
    rows: lagoonaRows(),
    connections: { north: { map: 'route4', offset: 0 } },
    buildings: [
      { kind: 'hut', x: 4, y: 5, variant: 1, to: { map: 'lagoona_hut1', x: 4, y: 7 } },
      { kind: 'hut', x: 12, y: 5, variant: 2, to: { map: 'lagoona_hut2', x: 4, y: 7 } },
      { kind: 'haven', x: 2, y: 19, to: { map: 'lagoona_haven', x: 5, y: 8 } },
      { kind: 'market', x: 13, y: 20, to: { map: 'lagoona_market', x: 4, y: 7 } },
      { kind: 'hall', x: 25, y: 4, variant: 2, to: { map: 'hall3', x: 5, y: 13 } },
    ],
    signs: [
      { x: 1, y: 21, text: 'LAGOONA\nA village that lives on the water.' },
      { x: 27, y: 10, text: 'LAGOONA WARDEN HALL\nWARDEN: MARINA\n"Go with the flow."' },
    ],
    npcs: [
      {
        id: 'hallguard',
        x: 29,
        y: 10,
        face: 'down',
        look: PEOPLE.swimmerM,
        when: (sv) => !sv.flags.gotNotes,
        text: "The WARDEN's out on the water, keeping an eye on the TIDEWRACK CREW.\fShe won't be back until their ship stops causing trouble out on ROUTE 4.",
      },
      {
        id: 'ferryman',
        x: 32,
        y: 17,
        face: 'left',
        look: PEOPLE.ferryman,
        script: async (s) => {
          if (!s.save.crests.includes('tide')) {
            await s.say("I run the ferry to BEACON ISLE. Only trainers with all three CRESTS may go.\fThe CHAMPION waits at the top of the lighthouse, and she doesn't see just anyone!")
            return
          }
          if (await s.ask('All three CRESTS! Shall I take you to BEACON ISLE?')) {
            s.sfx('splash')
            await s.warp('beacon', 2, 22, 'right')
          }
        },
      },
      {
        id: 'fisher',
        x: 12,
        y: 14,
        face: 'left',
        look: PEOPLE.fisher,
        text: 'The lagoon is so clear you can see beasts sleeping on the bottom. Shh, don\'t wake them.',
      },
      {
        id: 'girl',
        x: 20,
        y: 22,
        face: 'down',
        move: 'wander',
        look: PEOPLE.girl,
        text: 'MARINA can swim across the whole lagoon holding her breath! I tried. I made it to the first pier.',
      },
      {
        id: 'elder',
        x: 26,
        y: 12,
        face: 'left',
        move: 'look',
        look: PEOPLE.oldWoman,
        script: async (s) => {
          if (s.flag('gotNotes'))
            await s.say("The legend says ATOLLUS sleeps beneath the shrine on BEACON ISLE.\fOnly one who has proven themselves may enter. I think you might be that one, child.")
          else await s.say('The sea has been restless lately. The old folk say ATOLLUS is dreaming uneasy dreams.')
        },
      },
    ],
    encounters: {
      grass: {
        rate: 12,
        slots: [
          { species: 'cocrab', min: 24, max: 27, weight: 40 },
          { species: 'puffinaut', min: 24, max: 27, weight: 35 },
          { species: 'brandger', min: 24, max: 26, weight: 25 },
        ],
      },
      water: {
        rate: 8,
        slots: [
          { species: 'dugling', min: 22, max: 27, weight: 40 },
          { species: 'clionette', min: 22, max: 27, weight: 35 },
          { species: 'sawfry', min: 23, max: 27, weight: 25 },
        ],
      },
      fish: {
        rate: 75,
        slots: [
          { species: 'spinefin', min: 22, max: 26, weight: 40 },
          { species: 'dugling', min: 22, max: 26, weight: 30 },
          { species: 'clionette', min: 23, max: 26, weight: 30 },
        ],
      },
    },
  },
  haven('lagoona_haven', 'LAGOONA', { map: 'lagoona', x: 5, y: 23 }),
  market('lagoona_market', 'LAGOONA', { map: 'lagoona', x: 15, y: 23 }, ['orb', 'superOrb', 'hyperOrb', 'tideOrb', 'duskOrb', 'superSalve', 'hyperSalve', 'fullSalve', 'remedy', 'revivalSeed', 'ppDrop', 'muskSpray']),
  house(
    'lagoona_hut1',
    'LAGOONA',
    { map: 'lagoona', x: 5, y: 7 },
    [
      {
        id: 'weaver',
        x: 5,
        y: 4,
        face: 'left',
        look: PEOPLE.woman,
        text: 'We build our houses on stilts so the tide can pass right underneath. The beasts swim through our kitchen sometimes!',
      },
    ],
    { music: 'home' },
  ),
  house(
    'lagoona_hut2',
    'LAGOONA',
    { map: 'lagoona', x: 13, y: 7 },
    [
      {
        id: 'collector',
        x: 5,
        y: 5,
        face: 'left',
        look: PEOPLE.scientist,
        script: async (s) => {
          const n = s.save.caught.length
          await s.say(`I study the BEASTIARY records of every trainer who visits. You've caught ${n} kinds!`)
          if (n >= 25 && !s.flag('collectorGift')) {
            s.setFlag('collectorGift')
            await s.say("Twenty-five kinds! Remarkable. Please, accept these for your research.")
            await s.give('hyperOrb', 5)
          } else if (n < 25) await s.say('Catch twenty-five kinds and I\'ll have a reward for you!')
          else await s.say('Keep going! Every beast in the isles is waiting to be met.')
        },
      },
    ],
    { music: 'home' },
  ),
  {
    id: 'hall3',
    name: 'LAGOONA',
    music: 'hall',
    bg: 'water',
    border: 'void',
    indoor: true,
    rows: ['HHHHHHHHHHH', 'HHHHHHHHHHH', 'XXXXXXXXXXX', 'X~~~XXX~~~X', 'X~~~XXX~~~X', 'XXXXXXXXXXX', 'XX~~~X~~~XX', 'XX~~~X~~~XX', 'XXXXXXXXXXX', 'X~~XXXXX~~X', 'XXXXXXXXXXX', 'XXXXXXXXXXX', 'AXXXXXXXXXA', 'XXXXXmXXXXX'],
    warps: [{ x: 5, y: 13, to: 'lagoona', tx: 29, ty: 9, face: 'down' }],
    npcs: [
      {
        id: 'guide',
        x: 3,
        y: 12,
        face: 'right',
        look: PEOPLE.man,
        script: async (s) => {
          if (s.save.crests.includes('tide')) await s.say('Three CRESTS! The ferry to BEACON ISLE is waiting for you, champ!')
          else await s.say("MARINA's TIDE beasts are slippery. VOLT and LEAF moves will make them pay.\fAnd watch out for her SERAFIN. It thinks before it strikes.")
        },
      },
      {
        id: 'swimmer1',
        x: 1,
        y: 5,
        face: 'right',
        look: PEOPLE.swimmerF,
        sight: 4,
        trainer: {
          id: 'h3pearl',
          className: 'SWIMMER',
          name: 'PEARL',
          party: [
            { species: 'clionette', level: 25 },
            { species: 'lionspire', level: 25 },
          ],
          prize: 32,
          intro: "The hall's pools are warm, but my battles are ice cold!",
          lose: 'Brr. I got the chills.',
          after: 'MARINA trained me herself. She never stops smiling, even in a hard battle.',
        },
      },
      {
        id: 'swimmer2',
        x: 9,
        y: 8,
        face: 'left',
        look: PEOPLE.swimmerM,
        sight: 4,
        trainer: {
          id: 'h3cove',
          className: 'SWIMMER',
          name: 'COVE',
          party: [
            { species: 'clobberclaw', level: 26 },
            { species: 'dugling', level: 25 },
          ],
          prize: 32,
          intro: 'Dive in! The water\'s fine, and so am I!',
          lose: 'Ouch. Belly flop.',
          after: 'Go get her! MARINA\'s been waiting for a real challenge.',
        },
      },
      {
        id: 'marina',
        x: 5,
        y: 2,
        face: 'down',
        look: PEOPLE.marina,
        script: async (s) => {
          if (s.save.crests.includes('tide')) {
            await s.say("MARINA: You've got the TIDE CREST now, and all three besides!\fThe ferryman on the east pier will take you to BEACON ISLE. The CHAMPION is waiting.")
            return
          }
          await s.say("MARINA: So you're the one who sent SCRAG's ship packing! The whole lagoon is buzzing about it.\fI'm MARINA. The sea doesn't fight the shore. It just keeps coming back, again and again.\fLet's see if you can hold back the tide!")
          const won = await s.battle({
            id: 'marina',
            className: 'WARDEN',
            name: 'MARINA',
            party: [
              { species: 'lionspire', level: 27 },
              { species: 'clobberclaw', level: 28 },
              { species: 'serafin', level: 30 },
            ],
            prize: 120,
            intro: '',
            lose: 'Wow! You rode the wave all the way in!',
            after: '',
            ai: 'smart',
            items: ['hyperSalve', 'hyperSalve'],
          })
          if (!won) return
          await s.say("MARINA: That was wonderful! The TIDE CREST is yours.")
          s.save.crests.push('tide')
          void s.jingle('crestGet')
          await s.say('{PLAYER} received the TIDE CREST from MARINA!')
          await s.give('fullSalve', 2)
          await s.say("MARINA: With three CRESTS, you can take the ferry to BEACON ISLE from the east pier.\fThe CHAMPION of the isles, NERISSA, waits at the top of the lighthouse. Give her my best!")
        },
      },
    ],
  },
]
