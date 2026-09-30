/**
 * Helpers for the battle tests: a bag, quick beasts, and a driver that plays
 * a battle to the end with a choice policy while checking the event contract.
 * Not used by the game itself.
 */
import { Rng } from '../core/rng'
import type { SpeciesId } from '../data/dex'
import type { ItemId } from '../data/items'
import { move as moveData } from '../data/moves'
import type { Battle } from './Battle'
import { createCreature, type CreateOptions } from './creature'
import type { BattleBag, BattleEvent, Choice, Creature, Prompt } from './types'

export type EndPrompt = Extract<Prompt, { kind: 'end' }>

export type TestBag = BattleBag & { counts: Partial<Record<ItemId, number>> }

export function makeBag(init: Partial<Record<ItemId, number>> = {}): TestBag {
  const counts: Partial<Record<ItemId, number>> = { ...init }
  return {
    counts,
    count: (id) => counts[id] ?? 0,
    remove: (id, n = 1) => {
      counts[id] = Math.max(0, (counts[id] ?? 0) - n)
    },
  }
}

let nextSeed = 1000

/** A beast with its own seeded rolls; pass `seed` to pin it. */
export function beast(id: SpeciesId, level: number, opts: CreateOptions & { seed?: number } = {}): Creature {
  return createCreature(id, level, new Rng(opts.seed ?? nextSeed++), opts)
}

export const ALL_31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }
export const ALL_0 = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }

export function lastPrompt(events: BattleEvent[]): Prompt {
  const e = events[events.length - 1]
  if (!e || e.t !== 'prompt') throw new Error('batch does not end with a prompt')
  return e.prompt
}

export function texts(events: BattleEvent[]): string[] {
  const out: string[] = []
  for (const e of events) if (e.t === 'msg') out.push(e.text)
  return out
}

/** Every batch is non-empty, ends with a prompt, and has no other prompt. */
export function checkBatch(events: BattleEvent[]): void {
  if (!events.length) throw new Error('empty batch')
  lastPrompt(events)
  const prompts = events.filter((e) => e.t === 'prompt').length
  if (prompts !== 1) throw new Error(`batch has ${prompts} prompts`)
}

export type Policy = (p: Prompt, b: Battle) => Choice

/** First party beast that can fight and isn't out already (or the active one). */
export function firstHealthy(party: readonly Creature[], active: number): number {
  const i = party.findIndex((c, k) => c.hp > 0 && k !== active)
  return i < 0 ? active : i
}

/** The slot with the most power × accuracy that still has PP (slot 0 if none). */
export function strongestSlot(b: Battle): number {
  let slot = 0
  let best = -1
  b.view().moves.forEach((m, i) => {
    if (m.pp <= 0) return
    const d = moveData(m.id)
    const score = d.power * (d.accuracy || 100)
    if (score > best) {
      best = score
      slot = i
    }
  })
  return slot
}

/** Hits as hard as it can, sends in the first healthy beast, and never forgets a move. */
export function strongest(party: readonly Creature[]): Policy {
  return (p, b) => {
    if (p.kind === 'switch') return { kind: 'switch', partyIndex: firstHealthy(party, b.view().active) }
    if (p.kind === 'learn') return { kind: 'learn', forgetSlot: null }
    return { kind: 'move', slot: strongestSlot(b) }
  }
}

export interface Played {
  batches: BattleEvent[][]
  events: BattleEvent[]
  prompts: Prompt[]
  end: EndPrompt
}

/** Plays to the end with `policy`, checking every batch. */
export function play(b: Battle, policy: Policy, maxChoices = 2000): Played {
  const batches: BattleEvent[][] = [b.start()]
  checkBatch(batches[0])
  const prompts: Prompt[] = [lastPrompt(batches[0])]
  for (let i = 0; i < maxChoices; i++) {
    const p = prompts[prompts.length - 1]
    if (p.kind === 'end') return { batches, events: batches.flat(), prompts, end: p }
    const batch = b.choose(policy(p, b))
    checkBatch(batch)
    batches.push(batch)
    prompts.push(lastPrompt(batch))
  }
  throw new Error('battle did not end')
}
