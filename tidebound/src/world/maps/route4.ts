import type { MapDef, TrainerDef } from '../mapTypes'
import { PEOPLE } from '../people'
import { Paint } from './paint'

function route4Rows(): string[] {
  const p = new Paint(34, 40, '~')
  // The sandbar where the old wreck ran aground.
  p.blob(1, 10, 17, 13, ':')
  p.rect(3, 19, 3, 2, ',')
  p.set(2, 15, 'P').set(15, 13, 'P').set(14, 20, 'P')
  // A grassy islet to the east.
  p.blob(21, 5, 11, 9, ':')
  p.rect(23, 7, 7, 4, ',')
  p.set(29, 6, 'P').set(23, 11, 'P')
  // Little sandbars where swimmers rest.
  p.rect(17, 4, 1, 1, ':')
  p.rect(26, 21, 2, 1, ':')
  p.rect(11, 28, 2, 1, ':')
  p.rect(22, 33, 1, 1, ':')
  // A southern islet with a secret.
  p.blob(2, 30, 7, 5, ':')
  p.set(4, 31, 'P')
  // Rocks.
  for (const [x, y] of [
    [8, 3],
    [13, 7],
    [30, 16],
    [20, 17],
    [6, 25],
    [16, 24],
    [28, 27],
    [18, 31],
    [30, 35],
    [9, 36],
    [25, 38],
    [3, 5],
  ])
    p.set(x, y, 'O')
  return p.rows()
}

const swimmer = (id: string, name: string, party: TrainerDef['party'], intro: string, lose: string, after: string): TrainerDef => ({
  id,
  className: 'SWIMMER',
  name,
  party,
  prize: 20,
  intro,
  lose,
  after,
})

export const ROUTE4_MAPS: MapDef[] = [
  {
    id: 'route4',
    name: 'ROUTE 4',
    music: 'routeSea',
    bg: 'water',
    border: 'water',
    rows: route4Rows(),
    connections: { north: { map: 'sparkwharf', offset: 0 }, south: { map: 'lagoona', offset: 0 } },
    buildings: [{ kind: 'wreck', x: 4, y: 12, to: { map: 'wreck', x: 7, y: 11 } }],
    items: [
      { id: 'r4hyper', x: 4, y: 33, item: 'hyperOrb', qty: 2 },
      { id: 'r4seed', x: 28, y: 9, item: 'revivalSeed' },
      { id: 'r4dusk', x: 13, y: 20, item: 'duskOrb', qty: 2 },
    ],
    npcs: [
      {
        id: 'swim1',
        x: 17,
        y: 4,
        face: 'left',
        look: PEOPLE.swimmerM,
        sight: 5,
        trainer: swimmer(
          'r4kai',
          'MOANA',
          [
            { species: 'dugling', level: 20 },
            { species: 'spinefin', level: 21 },
          ],
          "Out here it's just me, the waves and a good battle!",
          'Wiped out by a wave… of attacks!',
          'The old wreck gives me the creeps. Something flaps around in the rigging at night.',
        ),
      },
      {
        id: 'swim2',
        x: 26,
        y: 21,
        face: 'down',
        look: PEOPLE.swimmerF,
        sight: 5,
        trainer: swimmer(
          'r4ula',
          'ULA',
          [
            { species: 'clionette', level: 21 },
            { species: 'puffinaut', level: 22 },
          ],
          'Did you know CLIONETTE glows when it dreams? Let me show you… in battle!',
          'Oh! My sea angel needs a nap.',
          'CLIONETTE live out here in the cold currents. They float so gently.',
        ),
      },
      {
        id: 'sailor',
        x: 11,
        y: 28,
        face: 'right',
        look: PEOPLE.sailor,
        sight: 6,
        trainer: {
          id: 'r4hank',
          className: 'SAILOR',
          name: 'HANK',
          party: [
            { species: 'jabshrimp', level: 22 },
            { species: 'sawfry', level: 22 },
          ],
          prize: 36,
          intro: 'My boat sprang a leak, so now I battle from this sandbar. Life at sea!',
          lose: 'Sunk twice in one day!',
          after: 'LAGOONA is due south. Their WARDEN swims faster than any boat I ever sailed.',
        },
      },
      {
        id: 'swim3',
        x: 22,
        y: 33,
        face: 'up',
        look: PEOPLE.swimmerM,
        sight: 5,
        trainer: swimmer(
          'r4tai',
          'TAI',
          [
            { species: 'murkeel', level: 22 },
            { species: 'dugling', level: 22 },
            { species: 'spinefin', level: 22 },
          ],
          'I swim this route every morning. You look like a good warm-down!',
          "I'm the one who needs a warm-down now…",
          'Keep an eye on your beasts\' HP out here. HAVENS are few and far between at sea.',
        ),
      },
      {
        id: 'grunt',
        x: 8,
        y: 17,
        face: 'down',
        look: PEOPLE.grunt,
        when: (sv) => !sv.flags['beat:r4guard'],
        sight: 3,
        trainer: {
          id: 'r4guard',
          className: 'CREW GRUNT',
          name: 'KNOT',
          party: [
            { species: 'murkeel', level: 21 },
            { species: 'tatterling', level: 21 },
          ],
          prize: 24,
          intro: "Oi! Nobody boards the CAPTAIN's ship without an invite! And you ain't invited!",
          lose: "Argh! Go on then, the CAPTAIN'll sort you out himself!",
          after: '',
        },
      },
    ],
    encounters: {
      grass: {
        rate: 12,
        slots: [
          { species: 'cocrab', min: 19, max: 22, weight: 30 },
          { species: 'puffinaut', min: 19, max: 22, weight: 25 },
          { species: 'jabshrimp', min: 19, max: 22, weight: 25 },
          { species: 'brandger', min: 20, max: 22, weight: 20 },
        ],
      },
      water: {
        rate: 9,
        slots: [
          { species: 'dugling', min: 18, max: 23, weight: 30 },
          { species: 'spinefin', min: 18, max: 23, weight: 25 },
          { species: 'clionette', min: 19, max: 23, weight: 20 },
          { species: 'murkeel', min: 19, max: 23, weight: 15 },
          { species: 'sawfry', min: 20, max: 24, weight: 10 },
        ],
      },
      fish: {
        rate: 75,
        slots: [
          { species: 'spinefin', min: 17, max: 22, weight: 35 },
          { species: 'jabshrimp', min: 17, max: 22, weight: 25 },
          { species: 'sawfry', min: 18, max: 22, weight: 25 },
          { species: 'murkeel', min: 18, max: 22, weight: 15 },
        ],
      },
    },
  },
  {
    id: 'wreck',
    name: 'THE OLD WRECK',
    music: 'wreck',
    bg: 'wreck',
    border: 'void',
    indoor: true,
    dark: true,
    escape: { map: 'route4', x: 8, y: 17 },
    rows: [
      'lllllllllllllll',
      'lllllllllllllll',
      'ddnddddddddkdDd',
      'ddddddkkddddddd',
      'lllllddddlllldd',
      'ddddlddddlddddd',
      'dkddlddddldnddd',
      'ddddddddddddddd',
      'ddnkddddddkdddd',
      'ddddddddddddddd',
      'lllllddddlllnll',
      'lllllldmdllllll',
    ],
    warps: [
      { x: 7, y: 11, to: 'route4', tx: 8, ty: 16, face: 'down' },
      { x: 13, y: 2, to: 'wreckhold', tx: 12, ty: 2, face: 'left' },
    ],
    items: [
      { id: 'wkhyper', x: 1, y: 3, item: 'hyperSalve' },
      { id: 'wkpp', x: 14, y: 6, item: 'zestBerry', qty: 2 },
    ],
    npcs: [
      {
        id: 'grunt1',
        x: 7,
        y: 5,
        face: 'down',
        look: PEOPLE.gruntF,
        sight: 3,
        trainer: {
          id: 'wkgrunt1',
          className: 'CREW GRUNT',
          name: 'BRINE',
          party: [
            { species: 'tatterling', level: 22 },
            { species: 'spinefin', level: 22 },
          ],
          prize: 24,
          intro: 'A stowaway! Get off our ship, you little barnacle!',
          lose: "Blast it all! The CAPTAIN won't like this…",
          after: 'The CAPTAIN found an old key down in the hold. Says it opens something BIG.',
        },
      },
      {
        id: 'grunt2',
        x: 12,
        y: 8,
        face: 'left',
        look: PEOPLE.grunt,
        sight: 4,
        trainer: {
          id: 'wkgrunt2',
          className: 'CREW GRUNT',
          name: 'MAST',
          party: [
            { species: 'murkeel', level: 23 },
            { species: 'jabshrimp', level: 22 },
          ],
          prize: 24,
          intro: "Salvage is our business, and business is booming! You're about to get salvaged!",
          lose: 'I… got salvaged.',
          after: 'Why\'d the CAPTAIN want some old professor\'s notes anyway? Treasure maps, I bet.',
        },
      },
    ],
    encounters: {
      cave: {
        rate: 8,
        slots: [
          { species: 'tatterling', min: 20, max: 24, weight: 60 },
          { species: 'murkeel', min: 20, max: 23, weight: 40 },
        ],
      },
    },
  },
  {
    id: 'wreckhold',
    name: 'THE OLD WRECK',
    music: 'wreck',
    bg: 'wreck',
    border: 'void',
    indoor: true,
    dark: true,
    escape: { map: 'route4', x: 8, y: 17 },
    rows: [
      'lllllllllllllll',
      'lllllllllllllll',
      'ddddkddddddddUd',
      'ddddddddddddddd',
      'dnddddlllddnddd',
      'ddddddldddddddd',
      'ddkdddldddddkdd',
      'ddddddddddddddd',
      'lllllllllllllll',
    ],
    warps: [{ x: 13, y: 2, to: 'wreck', tx: 12, ty: 2, face: 'left' }],
    npcs: [
      {
        id: 'grunt3',
        x: 8,
        y: 3,
        face: 'right',
        look: PEOPLE.gruntF,
        sight: 4,
        trainer: {
          id: 'wkgrunt3',
          className: 'CREW GRUNT',
          name: 'SKIFF',
          party: [
            { species: 'sawfry', level: 23 },
            { species: 'tatterling', level: 23 },
            { species: 'murkeel', level: 23 },
          ],
          prize: 24,
          intro: "You'll never reach the CAPTAIN! I'm the last line of defence!",
          lose: "I was the last line… and now there's no line.",
          after: 'Go on. He\'s right there. I\'m not stopping you. Clearly.',
        },
      },
      {
        id: 'scrag',
        x: 2,
        y: 3,
        face: 'right',
        look: PEOPLE.captain,
        when: (sv) => !sv.flags.scragFled,
        script: async (s) => {
          await s.say("SCRAG: Well, well. A child, sniffing round my ship.\fI'm CAPTAIN SCRAG of the TIDEWRACK CREW. The sea gives, and I take.\fWith the old professor's notes and the key I found in this hold, I'll wake ATOLLUS, the island beast!\fDo you know what collectors would pay for a living island? Neither do I. But I mean to find out!")
          const won = await s.battle({
            id: 'scrag',
            className: 'CAPTAIN',
            name: 'SCRAG',
            party: [
              { species: 'murkeel', level: 24 },
              { species: 'sailwraith', level: 25 },
              { species: 'lionspire', level: 26 },
            ],
            prize: 60,
            intro: '',
            lose: 'Keelhauled by a kid! This is mutiny!',
            after: '',
            ai: 'smart',
            items: ['hyperSalve'],
            music: 'battleVillain',
          })
          if (!won) return
          await s.say("SCRAG: Bah! Take the soggy notes. And the rusty key, too. It's more trouble than it's worth!\fBut mark my words. The sea never forgets, and neither does SCRAG!")
          await s.give('wreckKey')
          s.setFlag('gotNotes')
          await s.say("{PLAYER} got back PROF. MARIS's research notes!\fThe notes mention a shrine on BEACON ISLE… and a key that opens it.")
          const cap = s.npc('scrag')
          await s.walk(cap, 'lu', true)
          s.hide(cap)
          s.setFlag('scragFled')
          await s.say("SCRAG escaped through a hatch in the hull!\fThe CREW's boats are leaving. The way to LAGOONA is clear.")
        },
      },
    ],
  },
]
