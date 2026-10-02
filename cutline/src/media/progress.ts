/**
 * Passes progress on only when it has moved by at least `step` (or reached
 * 1), so a fast decode or export doesn't re-render the UI for every packet.
 * A drop (a restart after a fallback) always passes.
 */
export function throttleProgress(onProgress?: (fraction: number) => void, step = 0.0025): (fraction: number) => void {
  let last = -1
  return (fraction) => {
    if (!onProgress) return
    const f = Math.min(1, Math.max(0, fraction))
    if (Math.abs(f - last) >= step || (f === 1 && last !== 1)) {
      last = f
      onProgress(f)
    }
  }
}
