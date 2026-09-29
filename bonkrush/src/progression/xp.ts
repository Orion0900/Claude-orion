/** XP needed to go from `level` to `level + 1`: 14 at L1, 47 at L5, 103 at L10, 268 at L20. */
export function xpToNext(level: number): number {
  const l = Math.max(1, level)
  return Math.round(8 + 6 * l + 0.35 * l * l)
}

/**
 * Pours `amount` XP into a level/xp pair and reports how many levels it
 * crossed. One big shard can be worth several levels late in a run.
 */
export function gainXp(level: number, xp: number, amount: number): { level: number; xp: number; levelsGained: number } {
  let l = level
  let x = xp + (Number.isFinite(amount) && amount > 0 ? amount : 0)
  let levelsGained = 0
  for (let need = xpToNext(l); x >= need; need = xpToNext(l)) {
    x -= need
    l++
    levelsGained++
  }
  return { level: l, xp: x, levelsGained }
}
