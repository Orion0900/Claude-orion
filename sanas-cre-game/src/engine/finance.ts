/** The arithmetic of the business: IRRs and the distribution waterfall. */

/**
 * Annualized IRR of quarterly cash flows (negative in, positive out), or
 * null when there isn't one: nothing invested yet, or nothing back.
 */
export function irr(flows: readonly number[]): number | null {
  let neg = false
  let pos = false
  for (const f of flows) {
    if (f < -1e-6) neg = true
    else if (f > 1e-6) pos = true
  }
  if (!neg || !pos) return null
  const npv = (r: number) => {
    let sum = 0
    let d = 1
    for (const f of flows) {
      sum += f / d
      d *= 1 + r
    }
    return sum
  }
  // Quarterly rates from -50% to +100%: wider than any real estate deal goes.
  let lo = -0.5
  let hi = 1
  let fLo = npv(lo)
  const fHi = npv(hi)
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid)
    if (Math.abs(fMid) < 1e-6) {
      lo = hi = mid
      break
    }
    if (fLo * fMid < 0) hi = mid
    else {
      lo = mid
      fLo = fMid
    }
  }
  return Math.pow(1 + (lo + hi) / 2, 4) - 1
}

export interface WaterfallLedger {
  /** Everything investors have paid in. */
  called: number
  /** Everything investors have received back, carry excluded. */
  distributed: number
  carryPaid: number
  /** Capital not yet returned plus the preferred return accrued on it. */
  hurdle: number
}

export interface Split {
  lp: number
  gp: number
  /** The part that went to return of capital and the pref. */
  toHurdle: number
}

/** One quarter of preferred return accruing on whatever is still owed. */
export function accrue(hurdle: number, pref: number): number {
  return hurdle > 0 ? hurdle * Math.pow(1 + pref, 0.25) : hurdle
}

/**
 * A European, whole-fund waterfall. Investors get their capital and the
 * preferred return back first; then the GP takes everything until it has its
 * carry share of the profit so far (the full catch-up); then the rest splits
 * by the carry percentage.
 */
export function waterfall(amount: number, ledger: WaterfallLedger, carry: number): Split {
  if (amount <= 0) return { lp: 0, gp: 0, toHurdle: 0 }
  let left = amount
  const toHurdle = Math.min(left, Math.max(0, ledger.hurdle))
  let lp = toHurdle
  left -= toHurdle
  let gp = 0
  if (left > 0 && carry > 0) {
    const lpProfit = ledger.distributed + lp - ledger.called
    const owed = lpProfit > 0 ? (carry / (1 - carry)) * lpProfit - ledger.carryPaid : 0
    const catchUp = Math.min(left, Math.max(0, owed))
    gp += catchUp
    left -= catchUp
    gp += left * carry
    lp += left * (1 - carry)
  } else {
    lp += left
  }
  return { lp, gp, toHurdle }
}

/** Applies a split to a ledger, returning the new ledger. */
export function book(ledger: WaterfallLedger, split: Split): WaterfallLedger {
  return {
    called: ledger.called,
    distributed: ledger.distributed + split.lp,
    carryPaid: ledger.carryPaid + split.gp,
    hurdle: Math.max(0, ledger.hurdle - split.toHurdle),
  }
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function sum(values: readonly number[]): number {
  let total = 0
  for (const v of values) total += v
  return total
}
