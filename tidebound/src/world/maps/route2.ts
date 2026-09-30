import type { MapDef, TrainerDef } from '../mapTypes'
import { PEOPLE } from '../people'
import type { ScriptCtx } from '../script'
import { rivalStarter } from './driftwood'
import { haven, house, market } from './interiors'
import { Paint } from './paint'

function route2Rows(): string[] {
  const p = new Paint(44, 22, 'T')
  p.rect(0, 2, 44, 18, '.')
  // The path: in from MOSSGROVE, a loop south round the pond, then east to the cave.
  p.rect(0, 7, 14, 2, '=')
  p.rect(12, 7, 2, 8, '=')
  p.rect(12, 13, 20, 2, '=')
  p.rect(30, 10, 2, 5, '=')
  p.rect(30, 10, 12, 2, '=')
  // The pond, and a bridge over its tail.
  p.blob(15, 2, 12, 8, '~')
  p.rect(26, 4, 4, 3, '~')
  p.rect(27, 7, 1, 1, '~')
  // Tall grass.
  p.rect(2, 11, 8, 6, ',')
  p.rect(3, 2, 7, 3, ',')
  p.rect(15, 16, 13, 3, ',')
  p.rect(33, 13, 6, 5, ',')
  p.rect(28, 2, 9, 2, ',')
  // Ledges dropping south onto the lower path.
  p.hline(15, 11, 13, 'v')
  // Trees and flowers.
  p.rect(20, 9, 3, 2, 'T')
  p.rect(2, 18, 4, 2, 'T')
  p.set(34, 5, 'T').set(35, 5, 'T').set(34, 6, 'T')
  p.set(6, 9, '*').set(7, 9, '*').set(25, 16, '*')
  // The cliff with GLIMMER CAVE's mouth.
  p.rect(38, 2, 6, 8, 'C')
  p.rect(42, 10, 2, 10, 'T')
  p.set(40, 9, 'E')
  p.set(3, 6, 'S')
  p.set(36, 12, 'S')
  return p.rows()
}

const TOBY: TrainerDef = {
  id: 'r2toby',
  className: 'YOUNGSTER',
  name: 'TOBY',
  party: [
    { species: 'tubbara', level: 6 },
    { species: 'pufflet', level: 5 },
  ],
  prize: 16,
  intro: "Hey! You're a trainer, right? That means we HAVE to battle!",
  lose: "Aw, man! My TUBBARA fell asleep halfway through…",
  after: 'I train every day after school. Well, most days. Some days I nap with TUBBARA.',
}

const MILO: TrainerDef = {
  id: 'r2milo',
  className: 'BUG KID',
  name: 'MILO',
  party: [
    { species: 'twigling', level: 5 },
    { species: 'twigling', level: 6 },
  ],
  prize: 12,
  intro: "Shh! You'll scare off the bugs! …Oh well. Let's battle instead!",
  lose: 'My TWIGLINGS got snapped in half! Not literally!',
  after: 'TWIGLING evolves pretty early. It turns into a real walking branch!',
}

const JUNE: TrainerDef = {
  id: 'r2june',
  className: 'LASS',
  name: 'JUNE',
  party: [{ species: 'zappet', level: 7 }],
  prize: 20,
  intro: "Isn't my ZAPPET adorable? It's also VERY good at battling.",
  lose: "It's okay, ZAPPET. You're still adorable.",
  after: 'ZAPPET gets static in its fur. Every hug is a little zap!',
}

const ROSS: TrainerDef = {
  id: 'r2ross',
  className: 'CAMPER',
  name: 'ROSS',
  party: [
    { species: 'wombit', level: 7 },
    { species: 'tubbara', level: 7 },
  ],
  prize: 20,
  intro: "I camp out here to train before I take on GLIMMER CAVE. Show me what you've got!",
  lose: "Whoa! You're ready for the cave, no doubt about it.",
  after: 'Inside the cave, the glowing larvae light the way. Bring some REMEDY, just in case.',
}

async function rivalAmbush(s: ScriptCtx): Promise<void> {
  const rival = s.npc('rival')
  s.music('rival')
  await s.emote(rival, 'exclaim')
  await s.walk(rival, 'l')
  const dy = s.player.y - rival.y
  if (dy !== 0) await s.walk(rival, (dy < 0 ? 'u' : 'd') + Math.abs(dy))
  const dx = s.player.x - rival.x + 1
  if (dx < 0) await s.walk(rival, 'l' + -dx)
  s.faceEach(rival, s.player)
  await s.say("{RIVAL}: There you are, {PLAYER}! I've already caught a bunch of new beasts.\fLet's see if you've been training, or just wandering around!")
  const won = await s.battle({
    id: 'rival2',
    className: 'RIVAL',
    name: 'SKYE',
    party: [
      { species: 'pufflet', level: 7 },
      { species: rivalStarter(s), level: 9 },
    ],
    prize: 60,
    intro: '',
    lose: "Hmph! Fine, you win this time. But I'm getting stronger every day!",
    after: '',
    ai: 'smart',
    music: 'battleRival',
    look: PEOPLE.rival,
  })
  if (!won) return
  s.faceEach(rival, s.player)
  await s.say("{RIVAL}: Glimmer Cave is just ahead. The larvae in there are so pretty when they glow!\fI'm heading straight through to BASALT TOWN. The WARDEN there uses STONE beasts. Better get ready!")
  await s.walk(rival, `r3u${rival.y - 9}`, true)
  s.hide(rival)
  s.setFlag('rival2Done')
  s.music('route')
}

export const ROUTE2_MAPS: MapDef[] = [
  {
    id: 'route2',
    name: 'ROUTE 2',
    music: 'route',
    bg: 'grass',
    border: 'tree',
    rows: route2Rows(),
    connections: { west: { map: 'mossgrove', offset: 0 } },
    warps: [{ x: 40, y: 9, to: 'glimmer', tx: 5, ty: 20, face: 'up' }],
    signs: [
      { x: 3, y: 6, text: 'ROUTE 2\n← MOSSGROVE    GLIMMER CAVE →' },
      { x: 36, y: 12, text: 'GLIMMER CAVE\nBASALT TOWN lies beyond.' },
    ],
    items: [
      { id: 'r2orbs', x: 9, y: 2, item: 'orb', qty: 3 },
      { id: 'r2remedy', x: 36, y: 17, item: 'remedy' },
      { id: 'r2salve', x: 23, y: 18, item: 'salve', qty: 2 },
    ],
    npcs: [
      { id: 'toby', x: 10, y: 5, face: 'down', look: PEOPLE.youngster, trainer: TOBY, sight: 3 },
      { id: 'milo', x: 8, y: 14, face: 'right', look: PEOPLE.bugKid, trainer: MILO, sight: 4 },
      { id: 'june', x: 22, y: 16, face: 'up', look: PEOPLE.lass, trainer: JUNE, sight: 2, move: 'look' },
      { id: 'ross', x: 33, y: 8, face: 'down', look: PEOPLE.camper, trainer: ROSS, sight: 3 },
      {
        id: 'fisher',
        x: 16,
        y: 10,
        face: 'up',
        look: PEOPLE.fisher,
        text: "The pond's full of SPINEFIN. Careful, their spines sting!\fIf I had a spare rod I'd give you one. There's a fisher down on the BASALT beach road who has plenty.",
      },
      {
        id: 'rival',
        x: 39,
        y: 12,
        face: 'left',
        look: PEOPLE.rival,
        when: (sv) => !sv.flags.rival2Done,
        text: '{RIVAL}: Hmm? Oh, it\'s you!',
      },
    ],
    triggers: [{ x: 36, y: 10, w: 1, h: 2, when: (sv) => !sv.flags.rival2Done, script: rivalAmbush }],
    encounters: {
      grass: {
        rate: 12,
        slots: [
          { species: 'tubbara', min: 4, max: 6, weight: 30 },
          { species: 'pufflet', min: 4, max: 6, weight: 25 },
          { species: 'twigling', min: 4, max: 6, weight: 20 },
          { species: 'zappet', min: 5, max: 7, weight: 15 },
          { species: 'wombit', min: 5, max: 7, weight: 10 },
        ],
      },
      water: { rate: 8, slots: [{ species: 'spinefin', min: 8, max: 12, weight: 100 }] },
      fish: {
        rate: 70,
        slots: [
          { species: 'spinefin', min: 6, max: 10, weight: 70 },
          { species: 'dugling', min: 6, max: 10, weight: 30 },
        ],
      },
    },
  },
  {
    id: 'glimmer',
    name: 'GLIMMER CAVE',
    music: 'cave',
    bg: 'cave',
    border: 'caveWall',
    dark: true,
    rows: glimmerRows(),
    escape: { map: 'route2', x: 40, y: 10 },
    warps: [
      { x: 5, y: 21, to: 'route2', tx: 40, ty: 9, face: 'down' },
      { x: 28, y: 3, to: 'basalt', tx: 3, ty: 6, face: 'down' },
    ],
    items: [
      { id: 'gcremedy', x: 3, y: 4, item: 'remedy' },
      { id: 'gcsuper', x: 21, y: 16, item: 'superSalve' },
      { id: 'gcdusk', x: 11, y: 7, item: 'duskOrb' },
      { id: 'gcwing', x: 27, y: 9, item: 'returnWing' },
    ],
    npcs: [
      {
        id: 'hiker',
        x: 18,
        y: 12,
        face: 'left',
        look: PEOPLE.hiker,
        sight: 4,
        trainer: {
          id: 'gcdoug',
          className: 'HIKER',
          name: 'DOUG',
          party: [
            { species: 'pebblit', level: 9 },
            { species: 'wombit', level: 9 },
          ],
          prize: 20,
          intro: 'Hah! Caves are for hikers, kid! Let me show you real rock power!',
          lose: "Well, I'll be. Solid as bedrock, you are.",
          after: 'Beasts made of STONE shrug off FLAME. Hit them with TIDE or LEAF instead.',
        },
      },
      {
        id: 'bugkid',
        x: 4,
        y: 11,
        face: 'right',
        look: PEOPLE.bugKid,
        sight: 1,
        trainer: {
          id: 'gcnell',
          className: 'BUG KID',
          name: 'NELL',
          party: [
            { species: 'lumigrub', level: 8 },
            { species: 'lumigrub', level: 8 },
          ],
          prize: 12,
          intro: 'The LUMIGRUBS glow brighter when they battle! Watch!',
          lose: 'Their lights went out! …Oh, they\'re just sleepy.',
          after: 'LUMIGRUB turns into LANTERWING, a moth that flies with a lantern tail!',
        },
      },
      {
        id: 'picnicker',
        x: 24,
        y: 4,
        face: 'right',
        look: PEOPLE.picnicker,
        sight: 3,
        trainer: {
          id: 'gcpia',
          className: 'PICNICKER',
          name: 'PIA',
          party: [
            { species: 'pufflet', level: 8 },
            { species: 'zappet', level: 8 },
          ],
          prize: 20,
          intro: "I got lost looking for the exit, so let's battle while I think!",
          lose: 'Oh! The exit is right behind me. Silly me.',
          after: 'BASALT TOWN is famous for its hot springs. I can\'t wait!',
        },
      },
    ],
    encounters: {
      cave: {
        rate: 10,
        slots: [
          { species: 'lumigrub', min: 6, max: 9, weight: 40 },
          { species: 'pebblit', min: 7, max: 10, weight: 30 },
          { species: 'wombit', min: 7, max: 9, weight: 20 },
          { species: 'tatterling', min: 8, max: 10, weight: 10 },
        ],
      },
      water: { rate: 8, slots: [{ species: 'murkeel', min: 10, max: 14, weight: 100 }] },
      fish: { rate: 60, slots: [{ species: 'murkeel', min: 8, max: 12, weight: 100 }] },
    },
  },
  {
    id: 'basalt',
    name: 'BASALT TOWN',
    music: 'town',
    bg: 'grass',
    border: 'cliff',
    rows: basaltRows(),
    connections: { south: { map: 'route3', offset: 0 } },
    warps: [{ x: 3, y: 6, to: 'glimmer', tx: 27, ty: 3, face: 'left' }],
    buildings: [
      { kind: 'hall', x: 11, y: 1, variant: 0, to: { map: 'hall1', x: 5, y: 13 } },
      { kind: 'haven', x: 2, y: 9, to: { map: 'basalt_haven', x: 5, y: 8 } },
      { kind: 'market', x: 22, y: 8, to: { map: 'basalt_market', x: 4, y: 7 } },
      { kind: 'house', x: 21, y: 15, variant: 2, to: { map: 'basalt_house', x: 4, y: 7 } },
    ],
    signs: [
      { x: 13, y: 8, text: 'BASALT TOWN WARDEN HALL\nWARDEN: BRECK\n"Hard as bedrock, warm as a hot spring."' },
      { x: 12, y: 19, text: 'BASALT TOWN\nHot springs at the foot of the old volcano.' },
    ],
    npcs: [
      {
        id: 'guard',
        x: 14,
        y: 22,
        face: 'up',
        look: PEOPLE.worker,
        when: (sv) => !sv.crests.includes('crag'),
        text: "Sorry, the beach road is closed while the WARDEN trials are on.\fBeat WARDEN BRECK and you can pass. Rules are rules!",
      },
      {
        id: 'bather',
        x: 7,
        y: 17,
        face: 'right',
        move: 'look',
        look: PEOPLE.oldMan,
        text: "Ahh… Nothing like a hot spring after a long day. Even the beasts love it.\fThey say the volcano's been quiet for a hundred years. Let's keep it that way!",
      },
      {
        id: 'kid',
        x: 18,
        y: 12,
        face: 'down',
        move: 'wander',
        look: PEOPLE.girl,
        text: 'WARDEN BRECK can lift a boulder over his head! With ONE hand!',
      },
    ],
  },
  haven('basalt_haven', 'BASALT TOWN', { map: 'basalt', x: 5, y: 13 }),
  market('basalt_market', 'BASALT TOWN', { map: 'basalt', x: 24, y: 11 }, ['orb', 'superOrb', 'salve', 'superSalve', 'remedy', 'muskSpray', 'returnWing']),
  house('basalt_house', 'BASALT TOWN', { map: 'basalt', x: 23, y: 18 }, [
    {
      id: 'mum',
      x: 5,
      y: 4,
      face: 'left',
      look: PEOPLE.woman,
      text: 'My son dreams of being a WARDEN like BRECK. He practises lifting pebbles every morning.',
    },
    {
      id: 'son',
      x: 6,
      y: 6,
      face: 'up',
      move: 'wander',
      look: PEOPLE.boy,
      text: 'Ninety-eight… ninety-nine… one hundred pebbles! Tomorrow I\'ll try TWO pebbles.',
    },
  ]),
  {
    id: 'hall1',
    name: 'BASALT TOWN',
    music: 'hall',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: [
      'HHHHHHHHHHH',
      'HHHHHHHHHHH',
      '_r_______r_',
      '___________',
      'rrr__r__rrr',
      '___________',
      '__r_____r__',
      '___________',
      'rrrr___rrrr',
      '___________',
      '_r_______r_',
      '___________',
      'A_________A',
      '_____m_____',
    ],
    warps: [{ x: 5, y: 13, to: 'basalt', tx: 15, ty: 6, face: 'down' }],
    npcs: [
      {
        id: 'guide',
        x: 3,
        y: 12,
        face: 'right',
        look: PEOPLE.man,
        script: async (s) => {
          if (s.save.crests.includes('crag')) await s.say('You beat BRECK! That was a battle for the ages!')
          else
            await s.say("Welcome, challenger! WARDEN BRECK trains STONE beasts. They're tough, but TIDE and LEAF moves crack them wide open.\fEARTH and BRAWL work too. Good luck!")
        },
      },
      {
        id: 'hiker',
        x: 1,
        y: 9,
        face: 'right',
        look: PEOPLE.hiker,
        sight: 4,
        trainer: {
          id: 'h1boulder',
          className: 'HIKER',
          name: 'GARTH',
          party: [
            { species: 'pebblit', level: 10 },
            { species: 'pebblit', level: 10 },
          ],
          prize: 24,
          intro: 'Before you face BRECK, you face the mountain! That\'s me. I\'m the mountain.',
          lose: 'The mountain… has crumbled.',
          after: 'BRECK once carried a whole cart of rocks up the volcano. For fun.',
        },
      },
      {
        id: 'camper',
        x: 9,
        y: 5,
        face: 'left',
        look: PEOPLE.camper,
        sight: 4,
        trainer: {
          id: 'h1lyle',
          className: 'CAMPER',
          name: 'LYLE',
          party: [
            { species: 'wombit', level: 11 },
          ],
          prize: 24,
          intro: "BRECK taught me that a good defence is the best offence. Or was it the other way round?",
          lose: 'I forgot to defend! Or attack. Both, really.',
          after: 'BRECK is right behind me. Go on, you can do it!',
        },
      },
      {
        id: 'breck',
        x: 5,
        y: 2,
        face: 'down',
        look: PEOPLE.breck,
        script: async (s) => {
          if (s.save.crests.includes('crag')) {
            await s.say("BRECK: Ho ho! Back again? You've got a steady heart, kid. Keep it that way.\fSPARKWHARF's WARDEN VOLTA is next. Her beasts are fast. Blink and you'll miss 'em!")
            return
          }
          await s.say("BRECK: Welcome to BASALT! I'm BRECK, WARDEN of this town.\fStone doesn't rush. It waits, it weathers, and it wins in the end.\fShow me you've got the patience to wear down a mountain!")
          const won = await s.battle({
            id: 'breck',
            className: 'WARDEN',
            name: 'BRECK',
            party: [
              { species: 'pebblit', level: 11 },
              { species: 'wombit', level: 11 },
              { species: 'pebblit', level: 13 },
            ],
            prize: 100,
            intro: '',
            lose: 'Ho! You cracked my defence wide open!',
            after: '',
            ai: 'smart',
            items: ['superSalve'],
          })
          if (!won) return
          await s.say('BRECK: Well fought! You earned this, fair and square. The CRAG CREST!')
          s.save.crests.push('crag')
          void s.jingle('crestGet')
          await s.say('{PLAYER} received the CRAG CREST from BRECK!')
          await s.say("BRECK: The beach road south is open to you now.\fAnd take these. A Warden's gift for the road.")
          await s.give('superSalve', 2)
          await s.say("BRECK: The next WARDEN is VOLTA, in SPARKWHARF, east along the beach. Mind the TIDEWRACK CREW, too. They've been sniffing round the harbour.")
        },
      },
    ],
  },
]

function glimmerRows(): string[] {
  const p = new Paint(30, 24, 'W')
  p.rect(2, 15, 9, 6, '_')
  p.set(5, 21, '_')
  p.rect(4, 8, 2, 7, '_')
  p.rect(2, 3, 11, 6, '_')
  p.rect(7, 4, 4, 2, 'w')
  p.rect(12, 5, 7, 2, '_')
  p.rect(14, 9, 9, 9, '_')
  p.rect(16, 5, 2, 4, '_')
  p.rect(10, 17, 5, 2, '_')
  p.rect(22, 10, 6, 2, '_')
  p.rect(26, 3, 2, 8, '_')
  p.rect(20, 2, 8, 4, '_')
  p.set(28, 3, '_')
  // Rocks.
  p.set(15, 10, 'r').set(20, 14, 'r').set(17, 15, 'r').set(3, 16, 'r').set(9, 20, 'r').set(22, 3, 'r').set(12, 3, 'r')
  return p.rows()
}

function basaltRows(): string[] {
  const p = new Paint(30, 24, 'C')
  p.rect(1, 1, 28, 22, '.')
  // Volcano cliffs along the north.
  p.rect(0, 0, 30, 1, 'C')
  p.rect(1, 1, 9, 3, 'C')
  p.rect(20, 1, 9, 3, 'C')
  p.rect(1, 4, 5, 2, 'C')
  // The cave mouth from GLIMMER CAVE.
  p.set(3, 6, 'E')
  p.rect(1, 6, 2, 1, 'C')
  p.rect(4, 6, 2, 1, 'C')
  // Paths.
  p.rect(3, 7, 13, 2, '=')
  p.rect(14, 7, 2, 17, '=')
  p.rect(5, 14, 22, 2, '=')
  p.rect(24, 12, 2, 2, '=')
  p.rect(23, 16, 2, 3, '.')
  // Hot spring.
  p.rect(3, 17, 3, 4, '~')
  p.rect(6, 18, 3, 3, '~')
  p.rect(2, 21, 8, 1, 'o')
  // Trees and flowers.
  p.rect(17, 19, 3, 3, 'T')
  p.set(26, 5, 'T').set(27, 5, 'T').set(26, 6, 'T')
  p.set(10, 12, '*').set(11, 12, '*').set(19, 10, '*').set(20, 10, '*')
  p.set(13, 8, 'S').set(12, 19, 'S')
  // The road south to the beach: one cell wide, where the guard stands.
  p.rect(14, 22, 1, 2, '=')
  p.rect(15, 22, 1, 2, 'C')
  return p.rows()
}
