import type { MapDef } from '../mapTypes'
import { PEOPLE } from '../people'
import { reversePath } from '../script'
import { haven, house, market } from './interiors'
import { Paint } from './paint'

function route3Rows(): string[] {
  const p = new Paint(52, 18, 'T')
  p.rect(0, 0, 52, 2, 'C')
  p.rect(0, 2, 52, 6, '.')
  p.rect(0, 8, 52, 4, ':')
  p.rect(0, 12, 52, 6, '~')
  // The road down from BASALT TOWN, then east along the top of the beach.
  p.rect(14, 0, 1, 2, '=')
  p.rect(14, 2, 1, 5, '=')
  p.rect(14, 6, 38, 2, '=')
  // Coastal grass.
  p.rect(2, 2, 10, 4, ',')
  p.rect(18, 2, 9, 3, ',')
  p.rect(33, 2, 11, 3, ',')
  p.rect(6, 9, 4, 2, ',')
  // Cliffs and rocks at the west end.
  p.rect(0, 2, 2, 10, 'C')
  p.set(2, 8, 'o').set(2, 9, 'o').set(2, 10, 'o')
  // Palms along the sand.
  for (const [x, y] of [
    [4, 9],
    [12, 9],
    [21, 10],
    [31, 9],
    [39, 10],
    [46, 9],
    [28, 3],
    [45, 3],
  ])
    p.set(x, y, 'P')
  // A pier, and rocks out at sea.
  p.rect(26, 11, 2, 4, 'p')
  p.set(9, 14, 'O').set(18, 15, 'O').set(36, 14, 'O').set(44, 16, 'O').set(33, 16, 'O')
  // Flowers by the road.
  p.set(16, 5, '*').set(17, 5, '*').set(30, 5, '*')
  p.set(15, 3, 'S').set(48, 5, 'S')
  return p.rows()
}

export const ROUTE3_MAPS: MapDef[] = [
  {
    id: 'route3',
    name: 'ROUTE 3',
    music: 'routeSea',
    bg: 'beach',
    border: 'water',
    rows: route3Rows(),
    connections: { north: { map: 'basalt', offset: 0 }, east: { map: 'sparkwharf', offset: -2 } },
    signs: [
      { x: 15, y: 3, text: 'ROUTE 3 — THE BEACH ROAD\n↑ BASALT TOWN    SPARKWHARF →' },
      { x: 48, y: 5, text: 'SPARKWHARF HARBOUR — just ahead!\nPlease mind the cranes.' },
    ],
    items: [
      { id: 'r3super', x: 3, y: 3, item: 'superOrb', qty: 2 },
      { id: 'r3tide', x: 50, y: 10, item: 'tideOrb', qty: 2 },
      { id: 'r3pp', x: 34, y: 2, item: 'ppDrop' },
      { id: 'r3seed', x: 8, y: 10, item: 'revivalSeed' },
    ],
    npcs: [
      {
        id: 'rodfisher',
        x: 26,
        y: 14,
        face: 'up',
        look: PEOPLE.fisher,
        script: async (s) => {
          if (s.flag('gotRod')) {
            await s.say("Face the water and use the DRIFT ROD. Or press SELECT if you're in a hurry!\fDifferent waters, different bites.")
            return
          }
          await s.say("Ahoy there, young trainer! You've got the look of someone who likes a good bite.\fI've got more rods than sense. Here, take this one!")
          s.setFlag('gotRod')
          await s.give('driftRod')
          await s.say('Face any water and use it from your BAG. Or just press SELECT!\fEvery pond and sea has its own beasts. Go on, cast a line!')
        },
      },
      {
        id: 'fisher',
        x: 27,
        y: 13,
        face: 'up',
        look: PEOPLE.fisher,
        sight: 4,
        trainer: {
          id: 'r3ray',
          className: 'FISHER',
          name: 'RAY',
          party: [
            { species: 'spinefin', level: 13 },
            { species: 'dugling', level: 13 },
          ],
          prize: 28,
          intro: "The fish aren't biting, but you are! Let's battle!",
          lose: 'Reeled in… by a kid!',
          after: 'Fish near rocks for the rarer bites. Well, sometimes.',
        },
      },
      {
        id: 'swimmer',
        x: 36,
        y: 11,
        face: 'up',
        look: PEOPLE.swimmerF,
        sight: 4,
        trainer: {
          id: 'r3lani',
          className: 'SWIMMER',
          name: 'LANI',
          party: [
            { species: 'pufflet', level: 12 },
            { species: 'spinefin', level: 14 },
          ],
          prize: 20,
          intro: 'The water\'s perfect today! Almost as perfect as my beasts!',
          lose: "Oof. I think I'll go float for a while.",
          after: 'Once you can ride a TIDE beast, the whole sea opens up!',
        },
      },
      {
        id: 'picnicker',
        x: 20,
        y: 9,
        face: 'up',
        look: PEOPLE.picnicker,
        sight: 2,
        trainer: {
          id: 'r3dot',
          className: 'PICNICKER',
          name: 'DOT',
          party: [
            { species: 'cocrab', level: 13 },
            { species: 'tubbara', level: 13 },
          ],
          prize: 20,
          intro: 'A COCRAB stole my sandwich, so I caught it! Now it battles for me!',
          lose: "Aww. At least I still have half a sandwich.",
          after: "COCRAB hides in coconut shells. Tap the palms and one might drop out!",
        },
      },
      {
        id: 'camper',
        x: 40,
        y: 5,
        face: 'down',
        look: PEOPLE.camper,
        sight: 1,
        trainer: {
          id: 'r3wes',
          className: 'CAMPER',
          name: 'WES',
          party: [
            { species: 'zappet', level: 13 },
            { species: 'timberwalk', level: 15 },
          ],
          prize: 22,
          intro: "Hey! The road's clear, but you're not getting past without a battle!",
          lose: 'Road\'s all yours. Walk on.',
          after: 'SPARKWHARF\'s WARDEN uses VOLT beasts. EARTH moves shrug off volts completely.',
        },
      },
      {
        id: 'sailor',
        x: 47,
        y: 8,
        face: 'up',
        look: PEOPLE.sailor,
        sight: 2,
        trainer: {
          id: 'r3boyd',
          className: 'SAILOR',
          name: 'BOYD',
          party: [
            { species: 'jabshrimp', level: 14 },
            { species: 'murkeel', level: 15 },
          ],
          prize: 32,
          intro: 'Ahoy! Every sailor worth their salt battles at the harbour gate!',
          lose: 'Shiver me… I mean, well done.',
          after: 'Watch out for the TIDEWRACK CREW in SPARKWHARF. They\'ve been prowling round the docks.',
        },
      },
      {
        id: 'oldman',
        x: 10,
        y: 7,
        face: 'down',
        move: 'look',
        look: PEOPLE.oldMan,
        text: 'On clear nights you can see the BEACON ISLE lighthouse from here, far out across the water.\fThey say the CHAMPION of the isles waits at the top.',
      },
    ],
    encounters: {
      grass: {
        rate: 12,
        slots: [
          { species: 'cocrab', min: 10, max: 13, weight: 30 },
          { species: 'pufflet', min: 10, max: 13, weight: 25 },
          { species: 'zappet', min: 11, max: 13, weight: 20 },
          { species: 'jabshrimp', min: 11, max: 14, weight: 15 },
          { species: 'brandger', min: 12, max: 14, weight: 10 },
        ],
      },
      water: {
        rate: 8,
        slots: [
          { species: 'dugling', min: 14, max: 18, weight: 40 },
          { species: 'spinefin', min: 14, max: 18, weight: 40 },
          { species: 'murkeel', min: 15, max: 18, weight: 20 },
        ],
      },
      fish: {
        rate: 70,
        slots: [
          { species: 'spinefin', min: 10, max: 14, weight: 45 },
          { species: 'dugling', min: 10, max: 14, weight: 35 },
          { species: 'jabshrimp', min: 12, max: 15, weight: 20 },
        ],
      },
    },
  },
  {
    id: 'sparkwharf',
    name: 'SPARKWHARF',
    music: 'city',
    bg: 'beach',
    border: 'water',
    rows: sparkwharfRows(),
    connections: { west: { map: 'route3', offset: 2 }, south: { map: 'route4', offset: 0 } },
    // A save from inside the town that somehow missed the raid still finds its aftermath.
    onEnter: async (s) => {
      if (!s.flag('raidSeen') && s.player.x > 0) s.setFlag('raidSeen')
    },
    buildings: [
      { kind: 'haven', x: 2, y: 1, to: { map: 'spark_haven', x: 5, y: 8 } },
      { kind: 'market', x: 11, y: 2, to: { map: 'spark_market', x: 4, y: 7 } },
      { kind: 'hall', x: 20, y: 1, variant: 1, to: { map: 'hall2', x: 5, y: 13 } },
      { kind: 'bigHouse', x: 3, y: 11, to: { map: 'fieldoffice', x: 4, y: 7 } },
      { kind: 'house', x: 13, y: 11, variant: 1, to: { map: 'spark_house', x: 4, y: 7 } },
    ],
    signs: [
      { x: 18, y: 7, text: 'SPARKWHARF WARDEN HALL\nWARDEN: VOLTA\n"Lightning never waits."' },
      { x: 1, y: 7, text: 'SPARKWHARF\nThe harbour that never sleeps.' },
      { x: 11, y: 15, text: 'PROF. MARIS\'s FIELD OFFICE' },
    ],
    npcs: [
      {
        id: 'raider1',
        x: 5,
        y: 16,
        face: 'right',
        look: PEOPLE.grunt,
        when: (sv) => !sv.flags.raidSeen,
        text: '',
      },
      {
        id: 'raider2',
        x: 6,
        y: 17,
        face: 'right',
        look: PEOPLE.gruntF,
        when: (sv) => !sv.flags.raidSeen,
        text: '',
      },
      {
        id: 'aide',
        x: 7,
        y: 17,
        face: 'left',
        look: PEOPLE.aide,
        when: (sv) => !!sv.flags.raidSeen && !sv.flags.gotCharm,
        script: async (s) => {
          if (s.save.crests.includes('spark')) await s.say('The PROFESSOR is inside! She has something for you!')
          else
            await s.say("Those CREW thugs took the PROFESSOR's notes on the ATOLL legend and sailed off south toward the old wreck.\fWe can't follow them without a TIDE beast that can carry us… The PROFESSOR is on her way.\fMaybe earn VOLTA's CREST in the meantime? The PROFESSOR trusts WARDENS' judgement.")
        },
      },
      {
        id: 'worker',
        x: 30,
        y: 12,
        face: 'left',
        move: 'look',
        look: PEOPLE.worker,
        text: 'These cranes run on beast power! Well, VOLT beast power. Each ZAPPET gets a snack an hour.',
      },
      {
        id: 'sailor',
        x: 22,
        y: 16,
        face: 'down',
        look: PEOPLE.sailor,
        script: async (s) => {
          if (s.save.bag.tideCharm) await s.say('With a TIDE CHARM you can ride your TIDE beast south across the harbour. The old wreck is out on ROUTE 4.')
          else await s.say("The ferry to LAGOONA's been cancelled with the CREW about. Nobody's sailing till they're dealt with.")
        },
      },
      {
        id: 'kid',
        x: 17,
        y: 9,
        face: 'down',
        move: 'wander',
        look: PEOPLE.youngster,
        text: 'VOLTA can make her LEMURGE glow so bright you see it from the lighthouse!',
      },
    ],
    // Whichever row you arrive on from ROUTE 3, you see the raid.
    triggers: [
      {
        x: 0,
        y: 1,
        w: 1,
        h: 15,
        when: (sv) => !sv.flags.raidSeen,
        script: async (s) => {
          const a = s.npc('raider1')
          const b = s.npc('raider2')
          await s.wait(10)
          s.music('villain')
          await s.say('?? : Move it, move it! Before the old lady gets back!')
          await Promise.all([s.walk(a, 'r28', true), s.walk(b, 'r27', true)])
          s.hide(a)
          s.hide(b)
          s.setFlag('raidSeen')
          const aide = s.npc('aide')
          await s.emote(aide, 'exclaim')
          // Round the office and up the west side to the player, keeping
          // clear of the HAVEN (rows 1-5) and the town sign at (1, 7).
          const py = s.player.y
          const path = `ul5${py === 7 ? 'u9' : py >= 6 ? `u${16 - py}l` : `u10lu${6 - py}`}`
          await s.walk(aide, path)
          s.faceEach(aide, s.player)
          await s.say("AIDE: {PLAYER}! Did you see them? The TIDEWRACK CREW!\fThey broke into the PROFESSOR's field office and stole her research on the ATOLL legend!\fThey're heading for the old wreck on ROUTE 4, but it's across open water…\fWe need a TIDE beast that can carry us. The PROFESSOR is on her way.")
          await s.walk(aide, reversePath(path))
          s.face(aide, 'left')
          s.music('city')
        },
      },
    ],
  },
  haven('spark_haven', 'SPARKWHARF', { map: 'sparkwharf', x: 5, y: 5 }),
  market('spark_market', 'SPARKWHARF', { map: 'sparkwharf', x: 13, y: 5 }, ['orb', 'superOrb', 'tideOrb', 'superSalve', 'hyperSalve', 'remedy', 'revivalSeed', 'muskSpray', 'returnWing']),
  house('spark_house', 'SPARKWHARF', { map: 'sparkwharf', x: 15, y: 14 }, [
    {
      id: 'sailorwife',
      x: 5,
      y: 4,
      face: 'left',
      look: PEOPLE.woman,
      text: 'My husband sails the ferry to LAGOONA. He says the lagoon is so clear you can see the beasts sleeping on the bottom.',
    },
    {
      id: 'tutor',
      x: 6,
      y: 6,
      face: 'up',
      look: PEOPLE.oldWoman,
      script: async (s) => {
        const lead = s.save.party[0]
        if (!lead) return
        await s.say("I used to be quite the trainer, you know. I'll let you in on a secret:\fBeasts learn new moves as they grow. If you ever turn one down, bring it to a HAVEN and rest. There's always more to learn!")
      },
    },
  ]),
  {
    id: 'fieldoffice',
    name: 'SPARKWHARF',
    music: 'lab',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: ['HHhHHHhHH', 'HHHHHHHHH', 'KZxxxxZKK', 'xxxxxxxxx', 'xxttxxxxx', 'xxxxxxxxY', 'Yxxxxxxxx', 'xxxxmxxxx'],
    warps: [{ x: 4, y: 7, to: 'sparkwharf', tx: 5, ty: 15, face: 'down' }],
    signs: [{ x: 1, y: 2, text: 'A tide-gauge machine. A sticky note reads: "ATOLL RISES WHEN THE CREW… (torn)"' }],
    npcs: [
      {
        id: 'prof',
        x: 4,
        y: 3,
        face: 'down',
        look: PEOPLE.prof,
        when: (sv) => !!sv.flags.raidSeen,
        script: async (s) => {
          if (!s.save.crests.includes('spark')) {
            await s.say("PROF. MARIS: {PLAYER}! Oh, what a mess. They took my notes on the ATOLL legend…\fThose notes describe how to wake the ancient beast ATOLLUS. In the wrong hands…\fPlease, go and earn VOLTA's CREST first. Then come back to me. I'll have something ready.")
            return
          }
          if (s.flag('gotCharm')) {
            await s.say('PROF. MARIS: The wreck is out on ROUTE 4, south of the harbour. Please be careful!')
            return
          }
          await s.say("PROF. MARIS: The SPARK CREST! VOLTA only gives those to trainers she truly trusts.\fThen I'll trust you with this. It's a TIDE CHARM.")
          s.setFlag('gotCharm')
          await s.give('tideCharm')
          await s.say("PROF. MARIS: With it, a TIDE beast in your party can carry you across the water.\fFace the sea and press A. Head south from the harbour to the old wreck on ROUTE 4.\fThe CREW's CAPTAIN, SCRAG, wants to wake ATOLLUS and sell it. Please stop him, {PLAYER}!")
          if (!s.save.party.some((c) => c.species === 'narlet' || c.species === 'narwhelm' || c.species === 'tidelance')) {
            await s.say('PROF. MARIS: You\'ll need a TIDE beast for this. DUGLING and SPINEFIN are easy to catch with a rod!')
          }
        },
      },
    ],
  },
  {
    id: 'hall2',
    name: 'SPARKWHARF',
    music: 'hall',
    bg: 'indoor',
    border: 'void',
    indoor: true,
    rows: ['HHHHHHHHHHH', 'HHHHHHHHHHH', 'ZXXXXXXXXXZ', 'XXXXXXXXXXX', 'ZZZZXXXZZZZ', 'XXXXXXXXXXX', 'XXXZZZZZXXX', 'XXXXXXXXXXX', 'ZZZZXXXZZZZ', 'XXXXXXXXXXX', 'XXXXXXXXXXX', 'XXXXXXXXXXX', 'AXXXXXXXXXA', 'XXXXXmXXXXX'],
    warps: [{ x: 5, y: 13, to: 'sparkwharf', tx: 24, ty: 6, face: 'down' }],
    npcs: [
      {
        id: 'guide',
        x: 3,
        y: 12,
        face: 'right',
        look: PEOPLE.man,
        script: async (s) => {
          if (s.save.crests.includes('spark')) await s.say('Two CRESTS! You\'re the real deal, champ.')
          else await s.say("VOLTA's VOLT beasts are fast and hit hard. EARTH beasts don't mind volts at all.\fAnd watch out for paralysis! A REMEDY cures it.")
        },
      },
      {
        id: 'sci',
        x: 9,
        y: 9,
        face: 'left',
        look: PEOPLE.scientist,
        sight: 5,
        trainer: {
          id: 'h2quark',
          className: 'SCIENTIST',
          name: 'QUARK',
          party: [
            { species: 'lumigrub', level: 16 },
            { species: 'zappet', level: 17 },
          ],
          prize: 36,
          intro: 'Hypothesis: I win. Let us test it!',
          lose: 'Hypothesis… rejected.',
          after: 'Data suggests VOLTA is even stronger than me. Significantly.',
        },
      },
      {
        id: 'worker',
        x: 1,
        y: 5,
        face: 'right',
        look: PEOPLE.worker,
        sight: 5,
        trainer: {
          id: 'h2sparky',
          className: 'ELECTRICIAN',
          name: 'DEX',
          party: [
            { species: 'zappet', level: 17 },
            { species: 'lanterwing', level: 17 },
          ],
          prize: 36,
          intro: 'Careful! This hall is live! And so are my beasts!',
          lose: "Short-circuited. Happens to the best of us.",
          after: 'I wire up the cranes. VOLTA wires up her beasts. We both get zapped a lot.',
        },
      },
      {
        id: 'volta',
        x: 5,
        y: 2,
        face: 'down',
        look: PEOPLE.volta,
        script: async (s) => {
          if (s.save.crests.includes('spark')) {
            await s.say("VOLTA: Still buzzing from our battle! The next WARDEN, MARINA, is in LAGOONA, across the sea.\fGo stop those CREW creeps first, though. The whole harbour's counting on you.")
            return
          }
          await s.say("VOLTA: So you're the kid who beat BRECK! I'm VOLTA. I keep the lights on in SPARKWHARF.\fLightning never waits and neither do I. Try to keep up!")
          const won = await s.battle({
            id: 'volta',
            className: 'WARDEN',
            name: 'VOLTA',
            party: [
              { species: 'zappet', level: 18 },
              { species: 'lanterwing', level: 18 },
              { species: 'lemurge', level: 21 },
            ],
            prize: 110,
            intro: '',
            lose: "Whoa! You grounded me completely!",
            after: '',
            ai: 'smart',
            items: ['superSalve', 'superSalve'],
          })
          if (!won) return
          await s.say("VOLTA: What a jolt! That's the SPARK CREST. You earned every volt of it!")
          s.save.crests.push('spark')
          void s.jingle('crestGet')
          await s.say('{PLAYER} received the SPARK CREST from VOLTA!')
          await s.give('hyperSalve', 2)
          await s.say("VOLTA: PROF. MARIS came looking for you. She's at her FIELD OFFICE by the docks. Go see her!")
        },
      },
    ],
  },
]

function sparkwharfRows(): string[] {
  const p = new Paint(34, 26, '~')
  p.rect(0, 0, 34, 1, 'T')
  p.rect(0, 1, 34, 15, '.')
  // The west road in from the beach, and the main street.
  p.rect(0, 8, 34, 2, '=')
  p.rect(0, 10, 2, 4, ':')
  p.rect(5, 6, 1, 2, '=')
  p.rect(13, 6, 1, 2, '=')
  p.rect(24, 7, 1, 1, '=')
  p.rect(10, 10, 1, 6, '=')
  p.rect(5, 16, 1, 1, '=')
  p.rect(15, 15, 1, 1, '=')
  // Docks: a boardwalk and piers out into the harbour.
  p.rect(0, 16, 34, 2, 'p')
  p.rect(8, 18, 2, 5, 'p')
  p.rect(20, 18, 2, 4, 'p')
  p.rect(28, 18, 2, 6, 'p')
  // Warehouses: crates and barrels by the cranes.
  p.rect(29, 10, 4, 1, 'k')
  p.rect(29, 13, 2, 1, 'n')
  p.set(32, 13, 'k').set(26, 12, 'Z').set(26, 13, 'Z')
  p.set(1, 7, 'S').set(18, 7, 'S').set(11, 15, 'S')
  p.set(31, 2, 'T').set(32, 2, 'T').set(31, 3, 'T').set(9, 6, '*').set(17, 5, '*').set(18, 5, '*')
  return p.rows()
}
