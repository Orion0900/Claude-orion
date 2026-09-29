import * as THREE from 'three'
import { EventBus } from '../core/events'
import { Rng } from '../core/rng'
import { CHARACTERS } from '../data/characters'
import { STAGES } from '../data/stages'
import type { GameContext, GameEvents, InputState } from '../game/types'
import { BASE_STATS } from '../progression/stats'
import { Player } from './Player'
import { STOPWATCH_IFRAMES } from './vitals'

const DT = 1 / 60

/** Flat ground and silent stubs: just enough of a run for the player to live in. */
function setup(stopwatches: number, start = new THREE.Vector3()) {
  let saves = stopwatches
  const events = new EventBus<GameEvents>()
  let died = 0
  events.on('playerDied', () => died++)
  const state: InputState = {
    move: { x: 0, y: 0 },
    look: { yaw: 0, pitch: 0 },
    jumpPressed: false,
    jumpHeld: false,
    slideHeld: false,
    interactPressed: false,
    pausePressed: false,
    tabHeld: false,
  }
  const noop = () => undefined
  const ctx = {
    scene: new THREE.Scene(),
    rng: new Rng(1),
    events,
    character: CHARACTERS[0],
    stage: STAGES[0],
    time: 0,
    world: {
      spots: { playerStart: start },
      heightAt: () => 0,
      normalAt: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
      collide: noop,
    },
    progression: {
      stats: { ...BASE_STATS },
      tryCheatDeath: () => saves-- > 0,
    },
    fx: { number: noop, flash: noop, shake: noop, burst: noop, ring: noop },
    audio: { play: noop },
    input: { state },
    interactables: { prompt: null },
  } as unknown as GameContext
  const player = new Player(ctx)
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) player.update(DT)
  }
  return { player, run, died: () => died }
}

describe('Player', () => {
  it('dies to a lethal hit without a Stopwatch', () => {
    const { player, died } = setup(0)
    player.hurt(1000, 'test')
    expect(player.alive).toBe(false)
    expect(died()).toBe(1)
  })

  it('is untouchable for 2 s after a Stopwatch save', () => {
    const { player, run, died } = setup(1)
    player.hurt(1000, 'test')
    expect(player.alive).toBe(true)
    expect(player.hp).toBe(1)

    // Well past the ordinary 0.5 s i-frames, still safe.
    run(STOPWATCH_IFRAMES - 0.3)
    expect(player.hurt(10, 'test')).toBe(0)
    expect(player.alive).toBe(true)

    run(0.4)
    expect(player.hurt(10, 'test')).toBeGreaterThan(0)
    expect(player.alive).toBe(false)
    expect(died()).toBe(1)
  })

  it('also grants the Stopwatch window after a fatal fall', () => {
    // 60 m up: the landing deals (60 − 9) × 4 = 204, more than a full health bar.
    const { player, run, died } = setup(1, new THREE.Vector3(0, 60, 0))
    for (let i = 0; i < 600 && !player.onGround; i++) run(DT)
    expect(player.onGround).toBe(true)
    expect(player.alive).toBe(true)
    expect(player.hp).toBe(1)
    expect(player.hurt(50, 'test')).toBe(0)
    run(1)
    expect(player.hurt(50, 'test')).toBe(0)
    expect(died()).toBe(0)
  })
})
