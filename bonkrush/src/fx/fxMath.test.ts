import {
  FRAME_BUDGET,
  MERGE_WINDOW,
  NUMBER_KINDS,
  NUMBER_STYLES,
  NumberPool,
  addTrauma,
  alwaysShown,
  decayTrauma,
  decorate,
  distanceScale,
  easeOutCubic,
  fadeOut,
  formatAmount,
  parseAmount,
  popScale,
  ringAlpha,
  ringScale,
  shakeMagnitude,
  shakeNoise,
  shrinkOut,
} from './fxMath'

describe('easing', () => {
  it('eases between 0 and 1 and clamps outside', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(3)).toBe(1)
  })

  it('fades only after the start point', () => {
    expect(fadeOut(0.3, 0.6)).toBe(1)
    expect(fadeOut(0.8, 0.6)).toBeCloseTo(0.5)
    expect(fadeOut(1, 0.6)).toBe(0)
    expect(fadeOut(1.5, 0.6)).toBe(0)
    expect(fadeOut(0.5, 1)).toBe(1)
    expect(fadeOut(1.2, 1)).toBe(0)
  })

  it('pops numbers in big, then settles to exactly 1', () => {
    expect(popScale(0)).toBeCloseTo(0.5)
    let peak = 0
    for (let t = 0; t < 0.2; t += 0.005) peak = Math.max(peak, popScale(t))
    expect(peak).toBeGreaterThan(1.4)
    expect(popScale(0.18)).toBe(1)
    expect(popScale(5)).toBe(1)
    expect(popScale(Number.NaN)).toBe(1)
  })

  it('shrinks particles out and grows rings out', () => {
    expect(shrinkOut(0)).toBe(1)
    expect(shrinkOut(0.5)).toBeGreaterThan(0.8)
    expect(shrinkOut(1)).toBe(0)
    expect(ringScale(0)).toBeGreaterThan(0)
    expect(ringScale(1)).toBeCloseTo(1)
    expect(ringAlpha(0)).toBe(1)
    expect(ringAlpha(1)).toBe(0)
  })

  it('scales numbers with distance within limits', () => {
    expect(distanceScale(11)).toBeCloseTo(1)
    expect(distanceScale(1000)).toBe(0.55)
    expect(distanceScale(0.1)).toBe(1.3)
    expect(distanceScale(Number.NaN)).toBe(1.3)
  })
})

describe('shake', () => {
  it('accumulates trauma up to 1 and ignores junk', () => {
    expect(addTrauma(0.2, 0.3)).toBeCloseTo(0.5)
    expect(addTrauma(0.9, 0.5)).toBe(1)
    expect(addTrauma(0.4, Number.NaN)).toBe(0.4)
    expect(addTrauma(0.4, -1)).toBe(0.4)
  })

  it('decays linearly to zero and not while paused', () => {
    expect(decayTrauma(1, 0.25, 2)).toBeCloseTo(0.5)
    expect(decayTrauma(0.1, 1)).toBe(0)
    expect(decayTrauma(0.7, 0)).toBe(0.7)
    expect(decayTrauma(0.7, Number.NaN)).toBe(0.7)
  })

  it('squares trauma into displacement', () => {
    expect(shakeMagnitude(0.5, 1)).toBeCloseTo(0.25)
    expect(shakeMagnitude(1, 0.6)).toBeCloseTo(0.6)
    expect(shakeMagnitude(2, 0.6)).toBeCloseTo(0.6)
    expect(shakeMagnitude(0, 0.6)).toBe(0)
  })

  it('makes smooth noise in range', () => {
    let previous = shakeNoise(0, 1)
    for (let t = 0; t < 3; t += 0.001) {
      const n = shakeNoise(t, 1)
      expect(Math.abs(n)).toBeLessThanOrEqual(1)
      expect(Math.abs(n - previous)).toBeLessThan(0.1)
      previous = n
    }
    expect(shakeNoise(0.3, 1)).not.toBeCloseTo(shakeNoise(0.3, 7))
  })
})

describe('number text', () => {
  it('parses only plain numbers', () => {
    expect(parseAmount('12')).toBe(12)
    expect(parseAmount('+3')).toBe(3)
    expect(parseAmount('4.5')).toBe(4.5)
    expect(parseAmount('DODGE')).toBeNaN()
    expect(parseAmount('-4')).toBeNaN()
    expect(parseAmount('12!')).toBeNaN()
    expect(parseAmount('')).toBeNaN()
  })

  it('formats sums readably', () => {
    expect(formatAmount(12.6)).toBe('13')
    expect(formatAmount(3.25)).toBe('3.3')
    expect(formatAmount(4)).toBe('4')
    expect(formatAmount(Number.NaN)).toBe('')
  })

  it('dresses numbers by kind and leaves words alone', () => {
    expect(decorate('crit', '40')).toBe('40!')
    expect(decorate('heal', '25')).toBe('+25')
    expect(decorate('gold', '+3')).toBe('+3')
    expect(decorate('xp', '5')).toBe('+5')
    expect(decorate('player', '12')).toBe('-12')
    expect(decorate('damage', '7')).toBe('7')
    expect(decorate('info', 'BONK!')).toBe('BONK!')
    expect(decorate('crit', 'BONK!')).toBe('BONK!')
  })

  it('has a style for every kind and hides only optional ones', () => {
    for (const kind of NUMBER_KINDS) {
      expect(NUMBER_STYLES[kind].life).toBeGreaterThan(0)
      expect(NUMBER_STYLES[kind].size).toBeGreaterThan(0)
    }
    expect(NUMBER_STYLES.crit.size).toBeGreaterThan(NUMBER_STYLES.damage.size)
    expect(alwaysShown('info')).toBe(true)
    expect(alwaysShown('player')).toBe(true)
    expect(alwaysShown('damage')).toBe(false)
  })
})

describe('NumberPool', () => {
  const fixed = () => 0.5

  it('spawns, ages and retires numbers', () => {
    const pool = new NumberPool(10, fixed)
    const i = pool.spawn(0, 1, 0, '5', 'damage')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(pool.count).toBe(1)
    expect(pool.text[i]).toBe('5')
    pool.update(NUMBER_STYLES.damage.life / 2)
    expect(pool.progress(i)).toBeCloseTo(0.5)
    pool.update(NUMBER_STYLES.damage.life)
    expect(pool.count).toBe(0)
    expect(pool.active[i]).toBe(0)
  })

  it('does not advance while paused', () => {
    const pool = new NumberPool(4, fixed)
    const i = pool.spawn(0, 0, 0, '5', 'damage')
    pool.update(0)
    expect(pool.age[i]).toBe(0)
    expect(pool.count).toBe(1)
  })

  it('merges young numbers of one kind at one spot and pops them again', () => {
    const pool = new NumberPool(10, fixed)
    const a = pool.spawn(0, 1, 0, '5', 'damage')
    pool.update(0.05)
    const b = pool.spawn(0.3, 1, 0, '7', 'damage')
    expect(b).toBe(a)
    expect(pool.count).toBe(1)
    expect(pool.text[a]).toBe('12')
    expect(pool.pop[a]).toBe(0)
  })

  it('keeps kinds, distant spots and older numbers apart', () => {
    const pool = new NumberPool(10, fixed)
    pool.spawn(0, 1, 0, '5', 'damage')
    pool.spawn(0, 1, 0, '5', 'crit')
    pool.spawn(5, 1, 0, '5', 'damage')
    expect(pool.count).toBe(3)
    pool.update(MERGE_WINDOW + 0.01)
    pool.spawn(0, 1, 0, '5', 'damage')
    expect(pool.count).toBe(4)
  })

  it('never merges words', () => {
    const pool = new NumberPool(10, fixed)
    pool.spawn(0, 1, 0, 'DODGE', 'info')
    pool.spawn(0, 1, 0, 'DODGE', 'info')
    expect(pool.count).toBe(2)
  })

  it('keeps crit and heal decoration through merges', () => {
    const pool = new NumberPool(10, fixed)
    const c = pool.spawn(0, 0, 0, '20', 'crit')
    pool.spawn(0, 0, 0, '30', 'crit')
    expect(pool.text[c]).toBe('50!')
    const h = pool.spawn(9, 0, 0, '5', 'heal')
    pool.spawn(9, 0, 0, '+5', 'heal')
    expect(pool.text[h]).toBe('+10')
  })

  it('recycles the oldest number when full', () => {
    const pool = new NumberPool(3, fixed)
    const first = pool.spawn(0, 0, 0, 'a', 'info')
    pool.update(0.3)
    pool.spawn(10, 0, 0, 'b', 'info')
    pool.update(0.1)
    pool.spawn(20, 0, 0, 'c', 'info')
    const next = pool.spawn(30, 0, 0, 'd', 'info')
    expect(next).toBe(first)
    expect(pool.count).toBe(3)
    expect(pool.text[next]).toBe('d')
  })

  it('drops plain damage past the per-frame budget but keeps the rest', () => {
    const pool = new NumberPool(500, fixed)
    let shown = 0
    for (let i = 0; i < FRAME_BUDGET + 30; i++) if (pool.spawn(i * 3, 0, 0, '1', 'damage') >= 0) shown++
    expect(shown).toBe(FRAME_BUDGET)
    expect(pool.spawn(-50, 0, 0, '9', 'crit')).toBeGreaterThanOrEqual(0)
    expect(pool.spawn(-60, 0, 0, '9', 'player')).toBeGreaterThanOrEqual(0)
    pool.update(0.016)
    expect(pool.spawn(-70, 0, 0, '1', 'damage')).toBeGreaterThanOrEqual(0)
  })

  it('rejects broken positions and clears', () => {
    const pool = new NumberPool(5, fixed)
    expect(pool.spawn(Number.NaN, 0, 0, '1', 'damage')).toBe(-1)
    pool.spawn(0, 0, 0, '1', 'damage')
    pool.clear()
    expect(pool.count).toBe(0)
    expect(pool.active.every((a) => a === 0)).toBe(true)
  })
})
