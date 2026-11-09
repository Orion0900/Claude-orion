/**
 * FARTHING TOWN: home. The player's house, the rival's house next door, and
 * PROF. STERLING's lab, where the adventure begins.
 */
import { critterFront } from '../../art/creatures'
import type { Gfx } from '../../engine/gfx'
import { PAL } from '../../engine/palettes'
import type { Scene } from '../../game/scene'
import { species, type SpeciesId } from '../../data/species'
import type { MapDef, TrainerDef } from '../mapTypes'
import type { ScriptCtx } from '../script'
import { house } from './common'
import { Paint } from './paint'

/** Shows a critter's picture in a window while the player decides. */
class Showcase implements Scene {
  readonly opaque = false
  constructor(private readonly id: SpeciesId) {}
  update(): void {}
  draw(g: Gfx): void {
    g.setPal(14, PAL[species(this.id).pal])
    g.window(48, 8, 64, 64)
    g.sprite(critterFront(this.id), 52, 12, { slot: 14 })
  }
}

const STARTERS: { id: SpeciesId; x: number; what: string }[] = [
  { id: 'pandle', x: 5, what: 'the fire critter' },
  { id: 'dipple', x: 6, what: 'the water critter' },
  { id: 'sproth', x: 7, what: 'the plant critter' },
]

/** The rival always takes the one that beats yours. */
export function rivalStarter(mine: SpeciesId | null): SpeciesId {
  if (mine === 'pandle') return 'dipple'
  if (mine === 'dipple') return 'sproth'
  return 'pandle'
}

/** The rival's lines change with the story; their team grows with it too. */
export function rivalTrainer(s: { rival: string; starter: SpeciesId | null }, id: string, party: TrainerDef['party'], o: Partial<TrainerDef> = {}): TrainerDef {
  return {
    id,
    className: 'RIVAL',
    name: s.rival,
    party,
    prize: 35,
    intro: '',
    lose: 'Hmph. Lucky break.',
    after: '',
    ai: 'smart',
    music: 'battleRival',
    ...o,
  }
}

async function pickStarter(s: ScriptCtx, i: number): Promise<void> {
  const st = STARTERS[i]
  if (s.flag('gotStarter')) {
    const taken = s.save.starter === st.id || rivalStarter(s.save.starter) === st.id
    await s.say(taken ? 'The capsule is empty.' : "That's PROF. STERLING's last critter.")
    return
  }
  if (!s.flag('profAsked')) {
    await s.say(`A capsule. There's a critter inside!`)
    return
  }
  const show = new Showcase(st.id)
  s.game.push(show)
  void s.game.audio.cry(st.id)
  const ok = await s.ask(`So you'd like ${species(st.id).name}, ${st.what}?`)
  s.game.pop(show)
  if (!ok) return
  s.save.starter = st.id
  s.set('gotStarter')
  s.hide(`cap${i}`)
  await s.say(`This critter is spirited and full of mischief. You two will get on famously!`)
  await s.giveCritter(st.id, 5)
  // The rival grabs theirs.
  const theirs = rivalStarter(st.id)
  const ti = STARTERS.findIndex((x) => x.id === theirs)
  await s.say(`${s.save.rival}: Then I'll take this one! Ha!`)
  await s.walk('rival', ti === 0 ? 'u1l1' : ti === 1 ? 'u1' : 'u1r1')
  s.hide(`cap${ti}`)
  await s.say(`${s.save.rival} received ${species(theirs).name}!`)
  await s.walk('rival', ti === 0 ? 'd1r1' : ti === 1 ? 'd1' : 'd1l1')
}

async function rivalChallenge(s: ScriptCtx): Promise<void> {
  if (!s.flag('gotStarter') || s.flag('rival1')) return
  s.music('rival')
  await s.say(`${s.save.rival}: Hold it right there!`)
  s.faceEachOther('rival')
  await s.walk('rival', 'd1')
  s.faceEachOther('rival')
  await s.say(`${s.save.rival}: We both got our critters, so let's see whose is better. No backing out!`)
  const t = rivalTrainer(s.save, 'rival1', [{ species: rivalStarter(s.save.starter), level: 5 }], {
    canLose: true,
    lose: "What?! I'll get you next time!",
    prize: 20,
  })
  const r = await s.battle(t)
  s.set('rival1')
  s.music('rival')
  if (r === 'win') await s.say(`${s.save.rival}: Grr… I picked the better one, I KNOW I did. Next time!`)
  else await s.say(`${s.save.rival}: Ha! Told you so! You'll want to train a bit, slowpoke.`)
  await s.say(`${s.save.rival}: I'm off to see the world. Catch me if you can!`)
  await s.walk('rival', 'r1d5')
  s.hide('rival')
  s.music('lab')
  await profGift(s)
}

async function profGift(s: ScriptCtx): Promise<void> {
  if (s.flag('gotAlmanac')) return
  await s.say(`PROF. STERLING: Ha! Quite the first battle. Now, ${s.save.name}, come here a moment.`)
  await s.say('This is an ALMANAC. It writes down every critter you meet, all by itself.')
  s.set('gotAlmanac')
  await s.give('almanac')
  await s.say('And these are CAPSULES. Toss one at a wild critter once it\'s worn out, and it may stay with you.')
  await s.give('capsule', 5)
  await s.say('Fill that ALMANAC for me, will you? Every critter in ARGENT! That has always been my dream.')
}

async function profTalk(s: ScriptCtx): Promise<void> {
  if (!s.flag('profAsked')) {
    s.set('profAsked')
    await s.say(`PROF. STERLING: ${s.save.name}! You made it. And ${s.save.rival} beat you here, as usual.`)
    await s.say('On the table are three young critters who need partners. I want you each to pick one.')
    await s.say(`${s.save.rival}: Hey! I was here first!`)
    await s.say(`PROF. STERLING: Patience. ${s.save.name}, you choose first. Go on, have a look.`)
    return
  }
  if (!s.flag('gotStarter')) {
    await s.say('Take your time. Look at each of them before you decide.')
    return
  }
  if (!s.flag('gotAlmanac')) {
    await profGift(s)
    return
  }
  const n = s.save.caught.length
  await s.say(`PROF. STERLING: Let's see… ${n} critter${n === 1 ? '' : 's'} caught so far. ${n < 10 ? 'Keep at it!' : n < 40 ? 'Splendid progress!' : 'Extraordinary! You are a natural.'}`)
}

function farthingTown(): MapDef {
  const p = new Paint(20, 18, 'T')
  p.rect(2, 2, 16, 14, '.')
  p.rect(9, 0, 2, 2, '=')
  p.rect(9, 2, 2, 8, '=')
  p.hline(4, 6, 12, '=')
  p.hline(6, 9, 8, '=')
  p.vline(6, 9, 6, '=')
  p.vline(13, 9, 6, '=')
  p.hline(6, 14, 8, '=')
  p.rect(14, 12, 3, 3, '~')
  p.hline(14, 11, 3, 'f')
  p.paste(2, 13, ['**', '*.', '**'])
  p.paste(15, 7, ['*.*', '.*.'])
  p.set(7, 5, 'M').set(12, 5, 'M').set(11, 7, 'S').set(4, 12, 'S')
  return {
    id: 'farthing',
    name: 'FARTHING TOWN',
    kind: 'town',
    music: 'home',
    border: 'tree',
    rows: p.rows(),
    soar: { x: 4, y: 7 },
    palette: { 3: 'roofRed' },
    connections: { north: { map: 'route1', offset: 0 } },
    buildings: [
      { kind: 'house', x: 3, y: 2, to: { map: 'home1f', x: 3, y: 6 } },
      { kind: 'house', x: 13, y: 2, to: { map: 'rivalHouse', x: 3, y: 6 } },
      { kind: 'lab', x: 7, y: 10, to: { map: 'lab', x: 5, y: 10 } },
    ],
    signs: [
      { x: 11, y: 7, text: 'FARTHING TOWN\nEvery fortune starts with a single coin.' },
      { x: 4, y: 12, text: "STERLING CRITTER LAB\nPlease knock. Unless it's an emergency." },
      { x: 7, y: 5, text: `Your family's mailbox. It's empty.` },
      { x: 12, y: 5, text: "The neighbours' mailbox." },
    ],
    triggers: [
      {
        x: 9,
        y: 2,
        w: 2,
        h: 1,
        when: (s) => !s.flags.gotStarter,
        script: async (s) => {
          await s.say("Hold on! Wild critters hide out in those weeds, and you've got nobody to watch your back.")
          await s.say("Get a partner from PROF. STERLING before you wander off. Her lab's just south.")
          await s.walk('player', 'd1')
        },
      },
    ],
    npcs: [
      {
        id: 'girl',
        x: 15,
        y: 9,
        move: 'wander',
        look: 'girl',
        text: (s) => (s.flags.gotStarter ? 'Ooh, a critter of your very own! Mine is still an egg… just kidding, critters don\'t lay eggs. Or do they?' : 'The PROF has been up since dawn. Something exciting is happening at the lab!'),
      },
      {
        id: 'man',
        x: 5,
        y: 8,
        move: 'look',
        look: 'man',
        text: 'Tall grass is where wild critters live. Step in it and something might pop out!',
      },
    ],
  }
}

export const FARTHING_MAPS: MapDef[] = [
  farthingTown(),
  {
    id: 'home1f',
    name: 'FARTHING TOWN',
    kind: 'indoor',
    music: 'home',
    border: 'void',
    rows: ['HHnHHnHH', 'KKxxxxxU', 'xxxxxxxx', 'xxxttxxx', 'xxxttxxx', 'xxxxxxxx', 'Yxxxxxxx', 'xxxmxxxx'],
    bg: 'indoor',
    warps: [
      { x: 3, y: 7, to: 'farthing', tx: 4, ty: 6, face: 'down' },
      { x: 7, y: 1, to: 'home2f', tx: 6, ty: 1, face: 'left' },
    ],
    npcs: [
      {
        id: 'mom',
        x: 5,
        y: 4,
        face: 'left',
        look: 'mom',
        script: async (s) => {
          if (!s.flag('gotStarter')) {
            await s.say(`MOM: Morning, sleepyhead! PROF. STERLING popped by. She wants to see you at the lab, and she had that twinkle in her eye.`)
            return
          }
          if (s.save.party.some((c) => c.hp < 999)) {
            await s.say(`MOM: ${s.save.name}! You look worn out. Sit down for a bit, and your critters too.`)
            await s.heal()
            await s.say("MOM: There. All better. Off you go, and don't forget to eat something!")
          }
        },
      },
    ],
  },
  {
    id: 'home2f',
    name: 'FARTHING TOWN',
    kind: 'indoor',
    music: 'home',
    border: 'void',
    rows: ['HHnHHnHH', 'QxxxxxxD', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxBx', 'xxxxxxBx', 'xRRxxxxx', 'xRRxVxxx'],
    bg: 'indoor',
    warps: [{ x: 7, y: 1, to: 'home1f', tx: 6, ty: 1, face: 'left' }],
    items: [{ id: 'home2fTonic', x: 3, y: 2, item: 'tonic', hidden: true }],
  },
  house('rivalHouse', 'FARTHING TOWN', { map: 'farthing', x: 14, y: 6 }, [
    {
      id: 'sister',
      x: 2,
      y: 3,
      face: 'right',
      look: 'woman',
      script: async (s) => {
        if (!s.flag('gotStarter')) {
          await s.say(`MAREN: Oh, hi ${s.save.name}! My little sibling ran off to the lab at the crack of dawn. Something about being first.`)
          return
        }
        if (!s.flag('gotMap')) {
          await s.say("MAREN: You're heading off too? Then take this. I drew it myself when I was your age.")
          s.set('gotMap')
          await s.give('regionMap')
          return
        }
        await s.say(`MAREN: Go easy on ${s.save.rival}, OK? They act tough, but they really look up to you.`)
      },
    },
  ]),
  {
    id: 'lab',
    name: 'STERLING LAB',
    kind: 'indoor',
    music: 'lab',
    border: 'void',
    rows: ['HHnHHHHnHH', 'ZZxxxxxxKK', 'xxxxxxxxxx', 'xxxxxtttxx', 'xxxxxxxxxx', 'xxxxxxxxxx', 'KKKKxxKKKK', 'xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxxmxxxx'],
    bg: 'indoor',
    warps: [{ x: 5, y: 11, to: 'farthing', tx: 10, ty: 14, face: 'down' }],
    triggers: [{ x: 4, y: 7, w: 3, h: 1, when: (s) => !!s.flags.gotStarter && !s.flags.rival1, script: rivalChallenge }],
    npcs: [
      { id: 'prof', x: 6, y: 2, face: 'down', look: 'prof', script: profTalk },
      {
        id: 'rival',
        x: 6,
        y: 5,
        face: 'up',
        look: 'rival',
        when: (s) => !s.flags.rival1,
        script: async (s) => {
          if (!s.flag('gotStarter')) await s.say(`${s.save.rival}: Hurry up and pick already! I've been waiting forever.`)
          else await s.say(`${s.save.rival}: My critter's way tougher than yours. Wanna see?`)
        },
      },
      ...STARTERS.map((st, i) => ({
        id: `cap${i}`,
        x: st.x,
        y: 3,
        look: 'boy' as const,
        prop: 'capsule' as const,
        when: (s: { starter: SpeciesId | null }) => s.starter !== st.id && rivalStarter(s.starter) !== st.id,
        script: (s: ScriptCtx) => pickStarter(s, i),
      })),
      { id: 'aide1', x: 1, y: 8, face: 'right', move: 'look', look: 'scientist', text: 'I study critter calls. Did you know every species has its own cry? Even siblings sound different!' },
      { id: 'aide2', x: 8, y: 9, face: 'left', move: 'wander', look: 'scientist', text: 'Critters grow stronger by battling. Some even change into something new!' },
    ],
  },
]
