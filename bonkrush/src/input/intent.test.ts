import { MOUSE_LOOK, addLook, clampToRadius, isOneShot, joystickVector, keyIntent, moveFromKeys } from './intent'

describe('input intent', () => {
  it('maps physical keys and falls back to key names', () => {
    expect(keyIntent('KeyW')).toBe('up')
    expect(keyIntent('ArrowLeft')).toBe('left')
    expect(keyIntent('Space')).toBe('jump')
    expect(keyIntent('ShiftRight')).toBe('slide')
    expect(keyIntent('ControlLeft')).toBe('slide')
    expect(keyIntent('KeyE')).toBe('interact')
    expect(keyIntent('Escape')).toBe('pause')
    expect(keyIntent('KeyP')).toBe('pause')
    expect(keyIntent('Tab')).toBe('tab')
    expect(keyIntent('', ' ')).toBe('jump')
    expect(keyIntent('KeyQ', 'q')).toBeNull()
  })

  it('knows which intents fire once per press', () => {
    expect(isOneShot('jump')).toBe(true)
    expect(isOneShot('pause')).toBe(true)
    expect(isOneShot('slide')).toBe(false)
    expect(isOneShot('up')).toBe(false)
  })

  it('normalises diagonal key movement and cancels opposites', () => {
    const v = { x: 0, y: 0 }
    moveFromKeys(true, false, false, true, v)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1)
    expect(v.x).toBeGreaterThan(0)
    expect(v.y).toBeGreaterThan(0)
    moveFromKeys(true, true, false, false, v)
    expect(v).toEqual({ x: 0, y: 0 })
    moveFromKeys(false, true, true, false, v)
    expect(v.x).toBeLessThan(0)
    expect(v.y).toBeLessThan(0)
  })

  it('turns a thumbstick drag into forward/right movement', () => {
    const v = { x: 0, y: 0 }
    // Dragging up the screen is forward.
    joystickVector(0, -60, 60, 0.12, v)
    expect(v.y).toBeCloseTo(1)
    expect(v.x).toBeCloseTo(0)
    joystickVector(200, 0, 60, 0.12, v)
    expect(v.x).toBeCloseTo(1)
    joystickVector(30, 0, 60, 0.12, v)
    expect(v.x).toBeGreaterThan(0.3)
    expect(v.x).toBeLessThan(0.5)
  })

  it('ignores the dead zone and degenerate input', () => {
    const v = { x: 1, y: 1 }
    joystickVector(5, 3, 60, 0.12, v)
    expect(v).toEqual({ x: 0, y: 0 })
    joystickVector(0, 0, 60, 0.12, v)
    expect(v).toEqual({ x: 0, y: 0 })
    joystickVector(10, 10, 0, 0.12, v)
    expect(v).toEqual({ x: 0, y: 0 })
  })

  it('keeps the knob inside the ring', () => {
    const k = { x: 0, y: 0 }
    clampToRadius(120, 0, 60, k)
    expect(k).toEqual({ x: 60, y: 0 })
    clampToRadius(10, -20, 60, k)
    expect(k).toEqual({ x: 10, y: -20 })
    clampToRadius(0, 0, 60, k)
    expect(k).toEqual({ x: 0, y: 0 })
  })

  it('scales look by sensitivity and inverts pitch on request', () => {
    const look = { yaw: 0, pitch: 0 }
    addLook(100, 50, MOUSE_LOOK, 1, false, look)
    expect(look.yaw).toBeCloseTo(0.22)
    expect(look.pitch).toBeCloseTo(0.11)
    const inv = addLook(100, 50, MOUSE_LOOK, 2, true, { yaw: 0, pitch: 0 })
    expect(inv.yaw).toBeCloseTo(0.44)
    expect(inv.pitch).toBeCloseTo(-0.22)
    const bad = addLook(Number.NaN, 5, MOUSE_LOOK, 1, false, { yaw: 0, pitch: 0 })
    expect(bad).toEqual({ yaw: 0, pitch: 0 })
  })
})
