import { AUTOSAVE_TICKS, AutoSave } from './autosave'
import type { Scene } from './scene'
import { newGame, type SaveData } from './state'

/** A stand-in for the overworld that can be free to walk or busy. */
function world(save: SaveData) {
  const w = {
    free: true,
    syncs: 0,
    scene: {
      opaque: true,
      update() {},
      draw() {},
      restingSave: () => {
        if (!w.free) return null
        w.syncs++
        return save
      },
    } as Scene,
  }
  return w
}

function setup() {
  const save = newGame('KAI', 0, 1)
  const w = world(save)
  const writes: string[] = []
  const game = { top: w.scene as Scene | undefined, frame: 0, faded: 0, save: save as SaveData | null }
  const auto = new AutoSave(game, (s) => {
    writes.push(`${s.map}@${game.frame}`)
    return true
  })
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      game.frame++
      auto.tick()
    }
  }
  return { save, w, writes, game, auto, run }
}

describe('autosave', () => {
  it('saves as soon as the player is free to walk, then every ten seconds', () => {
    const { writes, run } = setup()
    run(1)
    expect(writes).toEqual(['home2f@1'])
    run(AUTOSAVE_TICKS - 1)
    expect(writes).toHaveLength(1)
    run(1)
    expect(writes).toHaveLength(2)
  })

  it('saves on arriving on a new map without waiting', () => {
    const { save, writes, run } = setup()
    run(1)
    save.map = 'home1f'
    run(1)
    expect(writes).toEqual(['home2f@1', 'home1f@2'])
  })

  it('never saves in a battle, a menu, a cutscene or a fade', () => {
    const { w, writes, game, run } = setup()
    // A menu or battle on top: that scene has no restingSave.
    game.top = { opaque: true, update() {}, draw() {} }
    run(AUTOSAVE_TICKS * 2)
    // A cutscene: the overworld is on top but busy.
    game.top = w.scene
    w.free = false
    run(AUTOSAVE_TICKS * 2)
    // Free, but the screen is mid-fade.
    w.free = true
    game.faded = 0.5
    run(AUTOSAVE_TICKS * 2)
    expect(writes).toEqual([])
    // Once it settles, it catches up straight away.
    game.faded = 0
    run(1)
    expect(writes).toHaveLength(1)
  })

  it('saves when the app is put away, but only at a safe moment', () => {
    const { w, writes, auto } = setup()
    w.free = false
    expect(auto.flush()).toBe(false)
    w.free = true
    expect(auto.flush()).toBe(true)
    expect(writes).toHaveLength(1)
  })

  it('does nothing on the title screen', () => {
    const { writes, game, auto, run } = setup()
    game.save = null
    run(AUTOSAVE_TICKS * 2)
    expect(auto.flush()).toBe(false)
    expect(writes).toEqual([])
  })

  it('brings the position up to date before saving', () => {
    const { w, run } = setup()
    run(1)
    expect(w.syncs).toBe(1)
  })
})
