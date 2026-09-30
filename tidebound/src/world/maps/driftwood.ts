import type { SpeciesId } from '../../data/dex'
import type { MapDef, TrainerDef } from '../mapTypes'
import { PEOPLE } from '../people'
import type { ScriptCtx } from '../script'
import { house } from './interiors'

/** Which starter the rival takes: always the one strong against yours. */
export const RIVAL_PICK: Record<string, SpeciesId> = { leafolin: 'kindlet', kindlet: 'narlet', narlet: 'leafolin' }

const STARTERS: { id: SpeciesId; x: number; blurb: string }[] = [
  { id: 'leafolin', x: 3, blurb: 'LEAFOLIN, the LEAF PANGOLIN' },
  { id: 'kindlet', x: 4, blurb: 'KINDLET, the EMBER KID' },
  { id: 'narlet', x: 5, blurb: 'NARLET, the TUSK CALF' },
]

export function rivalStarter(s: ScriptCtx): SpeciesId {
  const mine = s.save.vars.starter
  const id = STARTERS[mine]?.id ?? 'leafolin'
  return RIVAL_PICK[id]
}

async function chooseStarter(s: ScriptCtx, index: number): Promise<void> {
  if (s.flag('gotStarter')) {
    await s.say('An empty stand. The orb that sat here is gone.')
    return
  }
  const st = STARTERS[index]
  await s.game.audio.cry(st.id)
  const yes = await s.ask(`So you'd like ${st.blurb}?`)
  if (!yes) return
  s.save.vars.starter = index
  s.setFlag('gotStarter')
  await s.giveBeast(st.id, 5, 'DRIFTWOOD')
  await s.say(`PROF. MARIS: A fine choice! ${st.id === 'kindlet' ? 'That little one has a big fire in it.' : st.id === 'narlet' ? 'It loves to sing, you know.' : 'It will curl up in your bag if you let it.'}`)
  // The rival takes the one strong against yours.
  const rival = s.npc('rival')
  const pick = RIVAL_PICK[st.id]
  await s.emote(rival, 'exclaim')
  await s.say('{RIVAL}: Then I choose… this one!')
  s.face(rival, 'left')
  await s.wait(10)
  s.sfx('orbOpen')
  s.setFlag('rivalPicked')
  await s.say(`{RIVAL} received ${pick.toUpperCase()}!`)
  s.faceEach(rival, s.player)
  await s.say("{RIVAL}: Hey, {PLAYER}! Let's see whose beast is stronger. Right here, right now!")
  const won = await s.battle(rival1(pick), rival)
  s.faceEach(rival, s.player)
  if (won) await s.say("{RIVAL}: Aww… I'll get you next time. My beast and I just need a little practice!")
  else await s.say('{RIVAL}: Yes! We did it! …Hey, you were pretty good too, you know.')
  await s.say("PROF. MARIS: Marvellous! Both of you. Here, let me rest your beasts.")
  s.heal()
  await s.jingle('heal')
  await s.say('PROF. MARIS: Now, a gift. This is a BEASTIARY. It records every beast you see and catch.')
  s.setFlag('dex')
  void s.game.audio.playJingle('keyItemGet')
  await s.say('{PLAYER} received the BEASTIARY!')
  await s.give('orb', 5)
  await s.say("PROF. MARIS: Throw an ORB at a tired wild beast to catch it.\fThe WARDENS of the isles test every young trainer. Beat them, and you'll earn their CRESTS.\fThe first WARDEN, BRECK, lives in BASALT TOWN, past GLIMMER CAVE. Start by heading north to MOSSGROVE.")
  await s.say("{RIVAL}: I'm going to fill the whole BEASTIARY before you! See you, {PLAYER}!")
  await s.walk(rival, 'd4', true)
  s.hide(rival)
  s.setFlag('labDone')
}

function rival1(species: SpeciesId): TrainerDef {
  return {
    id: 'rival1',
    className: 'RIVAL',
    name: 'SKYE',
    party: [{ species, level: 5 }],
    prize: 60,
    intro: '',
    lose: "Aww, no way! I thought I had you!",
    after: '',
    ai: 'basic',
    music: 'battleRival',
    look: PEOPLE.rival,
    canLose: true,
  }
}

export const DRIFTWOOD_MAPS: MapDef[] = [
  {
    id: 'home2f',
    name: 'DRIFTWOOD',
    music: 'home',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: ['HHhHHHhHH', 'HHHHHHHHH', 'KKxxQxVxD', 'xxxxxxxxx', 'xxxRRRxxx', 'BxxRRRxxx', 'BxxxxxxxY'],
    warps: [{ x: 8, y: 2, to: 'home1f', tx: 7, ty: 2, face: 'left' }],
    signs: [
      { x: 4, y: 2, text: "It's {PLAYER}'s PC. There's a message from Mum: 'Breakfast is downstairs!'" },
      { x: 6, y: 2, text: 'A cartoon about a brave little sea turtle is on. {PLAYER} has seen it a hundred times.' },
      { x: 0, y: 2, text: 'A shelf of beast picture books. The spines are worn from reading.' },
      { x: 1, y: 2, text: 'SEASHELLS OF THE AZURE ISLES, VOLUME 2. It\'s full of pressed shells.' },
    ],
  },
  {
    id: 'home1f',
    name: 'DRIFTWOOD',
    music: 'home',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: ['HHhHHHhHH', 'HHHHHHHHH', 'KxxxVxxxU', 'xxxxxxxxx', 'xxttxxxxx', 'xxttxxxxx', 'Yxxxxxxxx', 'xxxxmxxxx'],
    warps: [
      { x: 8, y: 2, to: 'home2f', tx: 7, ty: 2, face: 'left' },
      { x: 4, y: 7, to: 'driftwood', tx: 6, ty: 7, face: 'down' },
    ],
    signs: [
      { x: 4, y: 2, text: 'The news: "…and the TIDEWRACK CREW were spotted near SPARKWHARF again…"' },
      { x: 0, y: 2, text: "Mum's recipe books. One is titled 101 WAYS WITH COCONUT." },
    ],
    npcs: [
      {
        id: 'mom',
        x: 4,
        y: 4,
        face: 'left',
        look: PEOPLE.mom,
        script: async (s) => {
          if (s.save.party.length === 0) {
            await s.say("MUM: PROF. MARIS is waiting for you at the lab by the beach. Go on, don't keep her waiting!")
            return
          }
          const yes = await s.ask('MUM: {PLAYER}! You look worn out. Why not take a little rest?')
          if (yes) {
            await s.game.fadeOut(12)
            s.heal()
            await s.jingle('heal')
            await s.game.fadeIn(12)
            await s.say("MUM: There. All better! Take care out there, and call me if you need anything.")
          } else await s.say('MUM: Take care out there, sweetheart!')
        },
      },
    ],
    onEnter: async (s) => {
      if (s.flag('momShoes')) return
      s.setFlag('momShoes')
      const mom = s.npc('mom')
      await s.wait(10)
      await s.emote(mom, 'exclaim')
      await s.walk(mom, 'r3u')
      s.faceEach(mom, s.player)
      await s.say("MUM: Good morning, sleepyhead! Today's the big day, isn't it?\fPROF. MARIS said she has a beast for you to raise. I'm so proud!\fHere, take these. Every trainer needs a good pair of shoes.")
      await s.give('sprintShoes')
      await s.say("MUM: Hold B while you walk and you'll run like the wind!\fNow go on. The lab is by the beach, just south of here.")
      await s.walk(mom, 'dl3')
      s.face(mom, 'left')
    },
  },
  house(
    'rivalhouse',
    'DRIFTWOOD',
    { map: 'driftwood', x: 17, y: 7 },
    [
      {
        id: 'rivaldad',
        x: 5,
        y: 4,
        face: 'down',
        look: PEOPLE.rivalDad,
        text: "Oh, hello {PLAYER}! SKYE ran off to the lab at the crack of dawn. She's been counting the days till today.",
      },
    ],
    { rows: ['HHhHHHhHH', 'HHHHHHHHH', 'KKxxxxVxY', 'xxxxxxxxx', 'xxxRRRxxx', 'BxxRRRxxx', 'Bxxxxxxxx', 'xxxxmxxxx'] },
  ),
  {
    id: 'lab',
    name: 'DRIFTWOOD',
    music: 'lab',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: ['HHHhHHHhHHH', 'HHHHHHHHHHH', 'KKKZxxxZKKK', 'xxxxxxxxxxx', 'xxxtttxxxxx', 'xxxxxxxxxxx', 'xxxxxxxxxxx', 'KxxxxxxxxxK', 'YxxxxxxxxxY', 'xxxxxmxxxxx'],
    warps: [{ x: 5, y: 9, to: 'driftwood', tx: 16, ty: 15, face: 'down' }],
    signs: [
      { x: 3, y: 2, text: "A humming machine. A screen reads: TIDE LEVELS — ABNORMAL? (RECHECK)" },
      { x: 7, y: 2, text: 'A map of the AZURE ISLES. A ring of islands curls around a great lagoon.' },
      { x: 0, y: 2, text: 'Research notes: "The islands\' shape matches the old legend of the SLEEPING TURTLE…"' },
    ],
    npcs: [
      {
        id: 'prof',
        x: 5,
        y: 3,
        face: 'down',
        look: PEOPLE.prof,
        script: async (s) => {
          if (!s.flag('gotStarter')) await s.say('PROF. MARIS: Go on, choose one of the three beasts on the table!')
          else if (s.save.crests.length === 0)
            await s.say('PROF. MARIS: The first WARDEN, BRECK, is in BASALT TOWN, past GLIMMER CAVE. North to MOSSGROVE first!')
          else await s.say(`PROF. MARIS: ${s.save.caught.length} kinds of beasts caught already! The BEASTIARY is filling up nicely.`)
        },
      },
      { id: 'aide', x: 9, y: 6, face: 'left', move: 'look', look: PEOPLE.aide, text: 'The PROFESSOR studies how beasts and the tides affect each other. Very deep stuff. Literally!' },
      {
        id: 'rival',
        x: 7,
        y: 5,
        face: 'left',
        look: PEOPLE.rival,
        when: (sv) => !sv.flags.labDone,
        text: "{RIVAL}: Took you long enough, {PLAYER}! Pick yours first. I already know which one I want.",
      },
      ...STARTERS.map((st, i) => ({
        id: `starter${i}`,
        x: st.x,
        y: 4,
        look: PEOPLE.prof,
        prop: 'orb' as const,
        when: (sv: import('../../game/state').SaveData) =>
          !(sv.flags.gotStarter && sv.vars.starter === i) && !(sv.flags.rivalPicked && RIVAL_PICK[STARTERS[sv.vars.starter ?? 0].id] === st.id),
        script: (s: ScriptCtx) => chooseStarter(s, i),
      })),
    ],
    onEnter: async (s) => {
      if (s.flag('labIntro')) return
      s.setFlag('labIntro')
      await s.wait(8)
      await s.say("PROF. MARIS: Ah, {PLAYER}! Right on time. And you know {RIVAL}, of course.\fAs promised, today you each get a beast of your very own.\fThese three hatched here at the lab. Each is ready to see the world with a trainer.\fChoose the one you like best. Take your time!")
    },
  },
  {
    id: 'driftwood',
    name: 'DRIFTWOOD',
    music: 'town',
    bg: 'beach',
    border: 'water',
    rows: [
      'TTTTTTTTTTT==TTTTTTTTTTT',
      'TTTTTTTTTTT==TTTTTTTTTTT',
      'TT........*==*........TT',
      'TT.........==.........TT',
      'TT.........==.........TT',
      'TT.........==.........TT',
      'TT.........==.........TT',
      'TT.........==.........TT',
      'TT..M=============M...TT',
      'TT........S==.........TT',
      'TT**.......==.........TT',
      'TT**.......==.........TT',
      'TT.........==.........TT',
      'TT..fffff..==.........TT',
      'TT..f***f..==.........TT',
      'TT..fffff..==.........TT',
      'TT.........======.....TT',
      'TTP::::::::==:::::::::TT',
      'T:::::::::::::::::::::PT',
      ':::::pp:::::::::::::::::',
      '~~~~~pp~~~~~~~~~~~~~~~~~',
      '~~~~~pp~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~',
    ],
    connections: { north: { map: 'route1', offset: 0 } },
    buildings: [
      { kind: 'house', x: 4, y: 4, variant: 0, to: { map: 'home1f', x: 4, y: 7 } },
      { kind: 'house', x: 15, y: 4, variant: 1, to: { map: 'rivalhouse', x: 4, y: 7 } },
      { kind: 'lab', x: 13, y: 11, to: { map: 'lab', x: 5, y: 9 } },
    ],
    signs: [
      { x: 10, y: 9, text: 'DRIFTWOOD\nWhere the tide brings new beginnings.' },
      { x: 4, y: 8, text: "{PLAYER}'s house" },
      { x: 18, y: 8, text: "SKYE's house" },
    ],
    npcs: [
      { id: 'girl', x: 3, y: 11, face: 'right', move: 'wander', look: PEOPLE.girl, text: 'The flowers here grow in sand! Mum says the sea breeze makes them tough.' },
      {
        id: 'oldman',
        x: 15,
        y: 18,
        face: 'down',
        move: 'look',
        look: PEOPLE.oldMan,
        text: "When I was a boy I saw a turtle as big as an island, far out past the reef.\fNobody believes me. But the sea remembers, and so do I.",
      },
      {
        id: 'fisher',
        x: 6,
        y: 21,
        face: 'down',
        look: PEOPLE.fisher,
        text: "Shh! You'll scare the fish. …Well, the beasts. Out here, the fish ARE the beasts.",
      },
    ],
    triggers: [
      {
        x: 11,
        y: 2,
        w: 2,
        h: 1,
        when: (sv) => !sv.flags.gotStarter,
        script: async (s) => {
          await s.say("{PLAYER}! Don't wander into the tall grass without a beast of your own!\fPROF. MARIS is waiting at the lab by the beach.")
          await s.walk(s.player, 'd')
        },
      },
    ],
  },
]
