import type { MapDef } from '../mapTypes'
import { PEOPLE } from '../people'
import type { ScriptCtx } from '../script'
import { rivalStarter } from './driftwood'
import { Paint } from './paint'

/** Filled in at boot: rolls the credits after the Champion falls. */
export const endingHooks = {
  credits: async (_s: ScriptCtx): Promise<void> => {},
}

function beaconRows(): string[] {
  const p = new Paint(30, 26, '~')
  p.blob(2, 1, 26, 24, '.')
  p.blob(4, 3, 22, 20, '.')
  // Rocky shore round the north.
  p.rect(9, 0, 12, 2, 'C')
  p.rect(8, 1, 2, 2, 'C')
  p.rect(20, 1, 2, 2, 'C')
  // Sand around the edges.
  for (let y = 0; y < 26; y++)
    for (let x = 0; x < 30; x++) {
      if (p.get(x, y) !== '.') continue
      const nearWater = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => p.get(x + dx, y + dy) === '~')
      if (nearWater) p.set(x, y, ':')
    }
  // The lighthouse road and the path to the shrine.
  p.rect(14, 10, 1, 12, '=')
  p.rect(7, 21, 8, 1, '=')
  p.rect(14, 19, 11, 1, '=')
  // The ferry pier.
  p.rect(0, 22, 8, 1, 'p')
  // Tall grass on the headlands.
  p.rect(5, 7, 6, 5, ',')
  p.rect(19, 8, 6, 5, ',')
  p.rect(6, 15, 5, 3, ',')
  // Trees and flowers.
  p.set(11, 4, 'T').set(18, 4, 'T').set(6, 13, 'T').set(24, 13, 'T')
  p.set(12, 11, '*').set(16, 11, '*').set(13, 12, '*').set(15, 12, '*')
  p.set(16, 21, 'S')
  return p.rows()
}

async function finalRival(s: ScriptCtx): Promise<void> {
  const rival = s.npc('rival')
  s.music('rival')
  await s.emote(rival, 'exclaim')
  s.faceEach(rival, s.player)
  await s.say("{RIVAL}: {PLAYER}! I knew you'd make it here.\fThree CRESTS each, and the CHAMPION right up those stairs…\fBut only one of us is climbing first. Let's settle it, once and for all!")
  const won = await s.battle({
    id: 'rival3',
    className: 'RIVAL',
    name: 'SKYE',
    party: [
      { species: 'puffinaut', level: 31 },
      { species: 'lemurge', level: 31 },
      { species: 'wombastion', level: 32 },
      { species: rivalStarterFinal(s), level: 34 },
    ],
    prize: 80,
    intro: '',
    lose: "…Yeah. You're the real deal, {PLAYER}. I mean it.",
    after: '',
    ai: 'smart',
    items: ['hyperSalve', 'hyperSalve'],
    music: 'battleRival',
    look: PEOPLE.rival,
  })
  if (!won) return
  s.faceEach(rival, s.player)
  await s.say("{RIVAL}: Ever since the lab, you've always been one step ahead.\fGo on. Show NERISSA what a trainer from DRIFTWOOD can do!\fAnd {PLAYER}… thanks. For being a great rival.")
  s.heal()
  await s.jingle('heal')
  await s.say("{RIVAL} rested your beasts!")
  await s.walk(rival, 'l2', true)
  s.hide(rival)
  s.setFlag('rival3Done')
  s.music('beacon')
}

function rivalStarterFinal(s: ScriptCtx): 'canopangol' | 'volcaram' | 'tidelance' {
  const base = rivalStarter(s)
  return base === 'leafolin' ? 'canopangol' : base === 'kindlet' ? 'volcaram' : 'tidelance'
}

export const BEACON_MAPS: MapDef[] = [
  {
    id: 'beacon',
    name: 'BEACON ISLE',
    music: 'beacon',
    bg: 'grass',
    border: 'water',
    rows: beaconRows(),
    buildings: [
      { kind: 'lighthouse', x: 13, y: 2, to: { map: 'lighthouse1', x: 5, y: 10 } },
      { kind: 'shrine', x: 23, y: 16, to: { map: 'shrine', x: 4, y: 9 } },
    ],
    signs: [{ x: 16, y: 21, text: 'BEACON ISLE\nThe light at the end of the isles.' }],
    npcs: [
      {
        id: 'ferryman',
        x: 0,
        y: 22,
        face: 'right',
        look: PEOPLE.ferryman,
        script: async (s) => {
          if (await s.ask('Ready to head back to LAGOONA?')) {
            s.sfx('splash')
            await s.warp('lagoona', 31, 17, 'left')
          }
        },
      },
      {
        id: 'rival',
        x: 13,
        y: 12,
        face: 'right',
        look: PEOPLE.rival,
        when: (sv) => !sv.flags.rival3Done,
        text: '{RIVAL}: …',
      },
      {
        id: 'seal',
        x: 24,
        y: 19,
        look: PEOPLE.oldMan,
        prop: 'hidden',
        when: (sv) => !sv.flags.gotNotes,
        text: 'An old stone shrine. The door is sealed shut, with a keyhole shaped like a curling wave.',
      },
      {
        id: 'ace1',
        x: 8,
        y: 13,
        face: 'right',
        look: PEOPLE.camper,
        sight: 6,
        trainer: {
          id: 'bcace1',
          className: 'ACE TRAINER',
          name: 'FINN',
          party: [
            { species: 'cragoyle', level: 29 },
            { species: 'lemurge', level: 29 },
            { species: 'coconclaw', level: 30 },
          ],
          prize: 48,
          intro: 'Only the best trainers make it to BEACON ISLE. Prove you belong!',
          lose: 'You belong, all right. More than I do!',
          after: 'The CHAMPION uses all kinds of types. Bring a balanced team.',
        },
      },
      {
        id: 'ace2',
        x: 21,
        y: 15,
        face: 'left',
        look: PEOPLE.lass,
        sight: 7,
        trainer: {
          id: 'bcace2',
          className: 'ACE TRAINER',
          name: 'ROSA',
          party: [
            { species: 'serafin', level: 29 },
            { species: 'moraynight', level: 30 },
            { species: 'timberwalk', level: 29 },
          ],
          prize: 48,
          intro: "I came to challenge NERISSA too. But first, I'll challenge you!",
          lose: "Wow. Maybe you should go first after all.",
          after: 'Good luck up there. I mean it!',
        },
      },
      {
        id: 'keeper',
        x: 17,
        y: 17,
        face: 'down',
        move: 'look',
        look: PEOPLE.keeper,
        script: async (s) => {
          if (await s.ask("I'm the HAVEN keeper's sister! I look after trainers who come to challenge the CHAMPION. Rest your beasts?")) {
            s.heal()
            await s.jingle('heal')
            s.save.lastHaven = { map: 'beacon', x: 17, y: 18 }
            await s.say('All rested! Fair winds up there!')
          }
        },
      },
    ],
    triggers: [{ x: 14, y: 12, when: (sv) => !sv.flags.rival3Done, script: finalRival }],
    encounters: {
      grass: {
        rate: 12,
        slots: [
          { species: 'cragoyle', min: 27, max: 30, weight: 25 },
          { species: 'lemurge', min: 27, max: 30, weight: 25 },
          { species: 'brandger', min: 27, max: 30, weight: 20 },
          { species: 'timberwalk', min: 27, max: 30, weight: 20 },
          { species: 'driftwyrm', min: 27, max: 29, weight: 10 },
        ],
      },
      water: {
        rate: 8,
        slots: [
          { species: 'manatide', min: 30, max: 33, weight: 30 },
          { species: 'clionette', min: 27, max: 30, weight: 30 },
          { species: 'moraynight', min: 30, max: 32, weight: 20 },
          { species: 'sawbladon', min: 30, max: 32, weight: 20 },
        ],
      },
      fish: {
        rate: 75,
        slots: [
          { species: 'lionspire', min: 27, max: 30, weight: 40 },
          { species: 'clobberclaw', min: 27, max: 30, weight: 35 },
          { species: 'driftwyrm', min: 27, max: 29, weight: 25 },
        ],
      },
    },
  },
  {
    id: 'lighthouse1',
    name: 'BEACON LIGHTHOUSE',
    music: 'beacon',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: [' HHHHHHHHH ', 'HHHHhHhHHHH', 'HxxxxxxxxUH', 'HxxxxxxxxxH', 'HxxKxxxKxxH', 'HxxxxxxxxxH', 'HxxxxRxxxxH', 'HxxxxxxxxxH', 'HxxxxxxxxxH', 'HYxxxxxxxYH', 'HHHHHmHHHHH'],
    warps: [
      { x: 5, y: 10, to: 'beacon', tx: 14, ty: 9, face: 'down' },
      { x: 9, y: 2, to: 'lighthouse2', tx: 8, ty: 2, face: 'left' },
    ],
    npcs: [
      {
        id: 'lh1a',
        x: 2,
        y: 6,
        face: 'right',
        look: PEOPLE.sailor,
        sight: 6,
        trainer: {
          id: 'lh1a',
          className: 'SAILOR',
          name: 'OREN',
          party: [
            { species: 'clobberclaw', level: 30 },
            { species: 'sawbladon', level: 31 },
          ],
          prize: 40,
          intro: 'I keep the lamp oil stocked. And I keep challengers humble!',
          lose: "I'll… go check the lamp oil.",
          after: "Two more floors to the top. NERISSA's never lost a battle up there. Well, almost never.",
        },
      },
      {
        id: 'lh1b',
        x: 8,
        y: 4,
        face: 'down',
        look: PEOPLE.hiker,
        sight: 4,
        trainer: {
          id: 'lh1b',
          className: 'HIKER',
          name: 'BRAM',
          party: [
            { species: 'wombastion', level: 31 },
            { species: 'volcaram', level: 32 },
          ],
          prize: 40,
          intro: 'Climbing a lighthouse is easy compared to a mountain. Beating me is harder!',
          lose: 'Rockslide! On me!',
          after: "The view from the top is worth every step.",
        },
      },
    ],
  },
  {
    id: 'lighthouse2',
    name: 'BEACON LIGHTHOUSE',
    music: 'beacon',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: [' HHHHHHHHH ', 'HHHHhHhHHHH', 'HUxxxxxxxDH', 'HxxxxxxxxxH', 'HxKxxxxxKxH', 'HxxxxxxxxxH', 'HxxxxYxxxxH', 'HxxxxxxxxxH', 'HxKxxxxxKxH', 'HxxxxxxxxxH', 'HHHHHHHHHHH'],
    warps: [
      { x: 9, y: 2, to: 'lighthouse1', tx: 8, ty: 2, face: 'left' },
      { x: 1, y: 2, to: 'lighthouse3', tx: 2, ty: 2, face: 'right' },
    ],
    npcs: [
      {
        id: 'lh2a',
        x: 5,
        y: 3,
        face: 'down',
        look: PEOPLE.scientist,
        sight: 5,
        trainer: {
          id: 'lh2a',
          className: 'SCIENTIST',
          name: 'LUX',
          party: [
            { species: 'lanterwing', level: 31 },
            { species: 'serafin', level: 32 },
          ],
          prize: 44,
          intro: 'I study how the lighthouse beam affects beasts at sea. Care to be data?',
          lose: 'Fascinating. Painful, but fascinating.',
          after: 'The lamp on the top floor was lit by a LANTERWING, long ago. Or so the story goes.',
        },
      },
      {
        id: 'lh2b',
        x: 3,
        y: 8,
        face: 'right',
        look: PEOPLE.swimmerF,
        sight: 5,
        trainer: {
          id: 'lh2b',
          className: 'ACE TRAINER',
          name: 'IVY',
          party: [
            { species: 'sailwraith', level: 32 },
            { species: 'canopangol', level: 32 },
          ],
          prize: 48,
          intro: "Last stop before the CHAMPION. You'll have to get through me!",
          lose: 'The stairs are all yours. Knock her socks off!',
          after: 'NERISSA was a sailor before she was CHAMPION. She reads a battle like the weather.',
        },
      },
    ],
  },
  {
    id: 'lighthouse3',
    name: 'BEACON LIGHTHOUSE',
    music: 'beacon',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: [' HHHHHHHHH ', 'HHHhhhhhHHH', 'HDxxxxxxxxH', 'HxxxxZxxxxH', 'HxxxxxxxxxH', 'HxxxxxxxxxH', 'HxxxxxxxxxH', 'HxxxxxxxxxH', 'HHHHHHHHHHH'],
    warps: [{ x: 1, y: 2, to: 'lighthouse2', tx: 2, ty: 2, face: 'right' }],
    signs: [{ x: 5, y: 3, text: 'The great lamp of BEACON ISLE. Its light reaches every island in the chain.' }],
    npcs: [
      {
        id: 'nerissa',
        x: 5,
        y: 5,
        face: 'down',
        look: PEOPLE.nerissa,
        script: async (s) => {
          if (s.flag('champion')) {
            await s.say("NERISSA: The light keeps burning, CHAMPION. Come back any time for a rematch.")
            return
          }
          await s.say("NERISSA: So. The one the whole isles have been talking about.\fI'm NERISSA, CHAMPION of the AZURE ISLES. Every night I light this lamp so sailors can find their way home.\fYou've found your way here through wild seas, a pirate crew and three WARDENS.\fNow let's see if you can find your way past me!")
          const won = await s.battle({
            id: 'nerissa',
            className: 'CHAMPION',
            name: 'NERISSA',
            party: [
              { species: 'sailwraith', level: 34 },
              { species: 'clobberclaw', level: 34 },
              { species: 'lionspire', level: 35 },
              { species: 'sawbladon', level: 35 },
              { species: 'cragoyle', level: 35 },
              { species: 'manatide', level: 37 },
            ],
            prize: 150,
            intro: '',
            lose: "…Hah! The tide has turned. What a battle!",
            after: '',
            ai: 'smart',
            items: ['fullSalve', 'fullSalve'],
            music: 'battleChampion',
          })
          if (!won) return
          await s.say("NERISSA: Magnificent. You and your beasts moved like one wave.\fFrom today, {PLAYER}, you are the CHAMPION of the AZURE ISLES!")
          s.setFlag('champion')
          await endingHooks.credits(s)
        },
      },
    ],
  },
  {
    id: 'shrine',
    name: 'ATOLL SHRINE',
    music: 'cave',
    bg: 'water',
    border: 'void',
    indoor: true,
    dark: true,
    rows: [' WWWWWWW ', 'WWW___WWW', 'W__www__W', 'W_wwwww_W', 'W_wwwww_W', 'W__www__W', 'W_______W', 'WA_____AW', 'W_______W', 'WWWW_WWWW'],
    warps: [{ x: 4, y: 9, to: 'beacon', tx: 24, ty: 18, face: 'down' }],
    npcs: [
      {
        id: 'atollus',
        x: 4,
        y: 5,
        look: PEOPLE.oldMan,
        prop: 'hidden',
        when: (sv) => !sv.flags.atollusDone,
        script: async (s) => {
          await s.say('The water in the pool is utterly still… and warm, like a living thing.')
          if (!(await s.ask('Touch the water?'))) return
          s.sfx('splash')
          await s.wait(30)
          s.game.audio.stopMusic(0.5)
          await s.say('The pool begins to churn! Something vast is rising from the deep…')
          const outcome = await s.wild('atollus', 40, { noRun: true, music: 'battleLegend' })
          if (outcome === 'caught' || outcome === 'win') {
            s.setFlag('atollusDone')
            if (outcome === 'win') await s.say('ATOLLUS sank back beneath the water… The pool is calm once more.')
            else await s.say("The old legend was true. ATOLLUS, the island beast, has chosen to travel with {PLAYER}.")
          }
        },
      },
    ],
  },
]
