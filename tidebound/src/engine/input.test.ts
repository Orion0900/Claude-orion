import { InputHub } from './input'

describe('InputHub', () => {
  it('reports a press once, then holds', () => {
    const hub = new InputHub()
    hub.set('a', true, 'k')
    hub.tick()
    expect(hub.pressed('a')).toBe(true)
    hub.tick()
    expect(hub.pressed('a')).toBe(false)
    expect(hub.held('a')).toBe(true)
  })

  it('never loses a tap shorter than a frame', () => {
    const hub = new InputHub()
    hub.set('a', true, 'k')
    hub.set('a', false, 'k')
    hub.tick()
    expect(hub.pressed('a')).toBe(true)
    hub.tick()
    expect(hub.held('a')).toBe(false)
  })

  it('holds while any source holds', () => {
    const hub = new InputHub()
    hub.set('b', true, 'keyboard')
    hub.set('b', true, 'touch')
    hub.set('b', false, 'keyboard')
    hub.tick()
    expect(hub.held('b')).toBe(true)
  })

  it('auto-repeats a held direction after a delay', () => {
    const hub = new InputHub()
    hub.set('down', true, 'k')
    let repeats = 0
    for (let i = 0; i < 60; i++) {
      hub.tick()
      if (hub.repeat('down')) repeats++
    }
    expect(repeats).toBeGreaterThan(3)
    expect(repeats).toBeLessThan(15)
  })

  it('reports the latest held direction', () => {
    const hub = new InputHub()
    hub.set('left', true, 'k')
    hub.tick()
    hub.set('up', true, 'k')
    hub.tick()
    expect(hub.dir()).toBe('up')
    hub.set('up', false, 'k')
    hub.tick()
    expect(hub.dir()).toBe('left')
  })
})
