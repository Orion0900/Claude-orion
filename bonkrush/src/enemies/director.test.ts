import {
  aliveCap,
  behaviorSpawnWeight,
  bossHpScale,
  clumpSize,
  damageScale,
  effectiveDifficulty,
  eliteChance,
  encircleCount,
  encircleTimes,
  ghostTier,
  hpScale,
  intensityFor,
  minibossTimes,
  rosterWeights,
  spawnRate,
  swarmDamageMultiplier,
  swarmHpMultiplier,
  swarmRate,
  unlockedCount,
  waveCount,
  waveIndex,
} from './director'

describe('spawnRate', () => {
  it('opens stage 1 at 1.6 per second', () => {
    expect(spawnRate(0, 0)).toBeCloseTo(1.6)
    expect(spawnRate(0, 0, 0)).toBeCloseTo(1.6)
  })

  it('follows min(14, 1.6 + 1.5 × stage + 0.6 × min^1.25)', () => {
    expect(spawnRate(300, 0)).toBeCloseTo(1.6 + 0.6 * Math.pow(5, 1.25))
    expect(spawnRate(600, 0)).toBeCloseTo(1.6 + 0.6 * Math.pow(10, 1.25))
    expect(spawnRate(300, 0, 2)).toBeCloseTo(1.6 + 3 + 0.6 * Math.pow(5, 1.25))
  })

  it('opens later stages busier', () => {
    expect(spawnRate(0, 0, 1)).toBeCloseTo(3.1)
    expect(spawnRate(0, 0, 2)).toBeCloseTo(4.6)
  })

  it('caps at 14 before difficulty', () => {
    expect(spawnRate(3600, 0)).toBe(14)
    expect(spawnRate(3600, 0.5, 2)).toBeCloseTo(14 * 1.3)
  })

  it('scales with difficulty', () => {
    expect(spawnRate(0, 1)).toBeCloseTo(1.6 * 1.6)
  })

  it('halves while a boss is alive', () => {
    expect(spawnRate(240, 0.3, 1, true)).toBeCloseTo(spawnRate(240, 0.3, 1) / 2)
  })

  it('jumps to 14/s in the swarm', () => {
    expect(swarmRate(0)).toBe(14)
    expect(swarmRate(0.5)).toBeGreaterThan(14)
  })
})

describe('roster', () => {
  it('unlocks on schedule', () => {
    expect(unlockedCount(0, 6)).toBe(1)
    expect(unlockedCount(44.9, 6)).toBe(1)
    expect(unlockedCount(45, 6)).toBe(2)
    expect(unlockedCount(105, 6)).toBe(3)
    expect(unlockedCount(180, 6)).toBe(4)
    expect(unlockedCount(270, 6)).toBe(5)
    expect(unlockedCount(360, 6)).toBe(6)
    expect(unlockedCount(9999, 6)).toBe(6)
  })

  it('never weighs a locked type', () => {
    const w = rosterWeights(100, 6, [])
    expect(w).toHaveLength(6)
    expect(w[2]).toBe(0)
    expect(w[5]).toBe(0)
    expect(w[0]).toBeGreaterThan(0)
    expect(w[1]).toBeGreaterThan(0)
  })

  it('favours the newest few once they have ramped in', () => {
    const w = rosterWeights(500, 6, [])
    expect(w[5]).toBeGreaterThan(w[4])
    expect(w[4]).toBeGreaterThan(w[3])
    expect(w[3]).toBeGreaterThan(w[0])
  })

  it('ramps a freshly unlocked type in', () => {
    const early = rosterWeights(46, 6, [])[1]
    const later = rosterWeights(100, 6, [])[1]
    expect(early).toBeLessThan(later)
    expect(early).toBeGreaterThan(0)
  })

  it('keeps tanks and chargers a spice', () => {
    expect(behaviorSpawnWeight('tank')).toBe(0.12)
    expect(behaviorSpawnWeight('charger')).toBe(0.45)
    expect(behaviorSpawnWeight('chaser')).toBe(1)
    expect(behaviorSpawnWeight('boss')).toBe(0)
  })

  it('reuses the output array', () => {
    const out: number[] = [9, 9, 9, 9, 9, 9, 9, 9]
    expect(rosterWeights(0, 6, out)).toBe(out)
    expect(out).toHaveLength(6)
  })
})

describe('scaling', () => {
  it('scales HP by time, stage and difficulty', () => {
    expect(hpScale(0, 1, 0)).toBeCloseTo(1)
    expect(hpScale(600, 1, 0)).toBeCloseTo(Math.pow(2, 1.35))
    expect(hpScale(0, 2.2, 0)).toBeCloseTo(2.2)
    expect(hpScale(0, 1, 0.5)).toBeCloseTo(1.5)
  })

  it('scales damage more gently', () => {
    expect(damageScale(0, 1, 0)).toBeCloseTo(1)
    expect(damageScale(600, 1, 0)).toBeCloseTo(1.6)
    expect(damageScale(0, 4.5, 0)).toBeCloseTo(Math.pow(4.5, 0.6))
    expect(damageScale(0, 1, 1)).toBeCloseTo(1.5)
  })

  it('makes late bosses tougher', () => {
    expect(bossHpScale(0, 0)).toBe(1)
    expect(bossHpScale(600, 0)).toBeCloseTo(4.5)
    expect(bossHpScale(60, 1)).toBeCloseTo(2.7)
  })

  it('takes the difficulty stat as is (curse and greed are already in it), floored', () => {
    expect(effectiveDifficulty(0.35)).toBeCloseTo(0.35)
    expect(effectiveDifficulty(-5)).toBe(-0.5)
    expect(effectiveDifficulty(NaN)).toBe(0)
  })
})

describe('elites', () => {
  it('rolls 0.6% at the start, +1% per minute, capped at 6%', () => {
    expect(eliteChance(0)).toBeCloseTo(0.006)
    expect(eliteChance(120)).toBeCloseTo(0.026)
    expect(eliteChance(6000)).toBe(0.06)
  })
})

describe('final swarm', () => {
  it('turns purple at +3:00 and red at +6:00', () => {
    expect(ghostTier(0)).toBe(0)
    expect(ghostTier(179)).toBe(0)
    expect(ghostTier(180)).toBe(1)
    expect(ghostTier(360)).toBe(2)
  })

  it('gets stronger every 30 s', () => {
    expect(swarmHpMultiplier(0)).toBe(1)
    expect(swarmHpMultiplier(29)).toBe(1)
    expect(swarmHpMultiplier(30)).toBeCloseTo(1.25)
    expect(swarmHpMultiplier(90)).toBeCloseTo(1.75)
  })

  it('applies the tier multipliers to HP and damage', () => {
    expect(swarmHpMultiplier(180)).toBeCloseTo((1 + 0.25 * 6) * 2.5)
    expect(swarmHpMultiplier(360)).toBeCloseTo((1 + 0.25 * 12) * 6)
    expect(swarmDamageMultiplier(0)).toBe(1)
    expect(swarmDamageMultiplier(200)).toBe(2.5)
    expect(swarmDamageMultiplier(400)).toBe(6)
  })
})

describe('schedule', () => {
  it('sends minibosses at 7:00 and 2:00 left', () => {
    expect(minibossTimes(0, 600)).toEqual([180, 480])
    expect(minibossTimes(1, 540)).toEqual([120, 420])
  })

  it('sends them at 6:30 and 3:00 left on stage 3', () => {
    expect(minibossTimes(2, 480)).toEqual([90, 300])
  })

  it('surrounds the player at 5:30 and 3:30 left', () => {
    expect(encircleTimes(0, 600)).toEqual([270, 390])
    expect(encircleTimes(1, 540)).toEqual([210, 330])
  })

  it('surrounds them at 4:30 and 3:15 left on stage 3', () => {
    expect(encircleTimes(2, 480)).toEqual([210, 285])
  })

  it('rings the player with 30 + 10 × stage', () => {
    expect(encircleCount(0)).toBe(30)
    expect(encircleCount(1)).toBe(40)
    expect(encircleCount(2)).toBe(50)
  })

  it('counts 60 s wave slots', () => {
    expect(waveIndex(0)).toBe(0)
    expect(waveIndex(59.9)).toBe(0)
    expect(waveIndex(60)).toBe(1)
    expect(waveIndex(185)).toBe(3)
  })

  it('keeps waves between 20 and 40 for light types', () => {
    for (let t = 0; t <= 900; t += 60) {
      for (const roll of [0, 0.5, 1]) {
        const n = waveCount(t, 'chaser', roll)
        expect(n).toBeGreaterThanOrEqual(20)
        expect(n).toBeLessThanOrEqual(40)
      }
    }
  })

  it('thins waves of heavy types', () => {
    expect(waveCount(300, 'tank', 0.5)).toBeLessThan(waveCount(300, 'chaser', 0.5))
  })

  it('spawns clumps of 3 to 8', () => {
    expect(clumpSize(0)).toBe(3)
    expect(clumpSize(0.999)).toBe(8)
    expect(clumpSize(1)).toBe(8)
  })
})

describe('caps and intensity', () => {
  it('caps at 300, or 180 on low quality', () => {
    expect(aliveCap('high')).toBe(300)
    expect(aliveCap('medium')).toBe(300)
    expect(aliveCap('low')).toBe(180)
  })

  it('is 1 in the swarm and rises with time and crowd', () => {
    expect(intensityFor(10, 600, 0, 300, false, true)).toBe(1)
    const calm = intensityFor(0, 600, 0, 300, false, false)
    const busy = intensityFor(500, 600, 280, 300, false, false)
    expect(calm).toBeLessThan(0.3)
    expect(busy).toBeGreaterThan(0.8)
    expect(busy).toBeLessThanOrEqual(1)
    expect(intensityFor(0, 600, 0, 300, true, false)).toBeGreaterThanOrEqual(0.85)
  })
})
