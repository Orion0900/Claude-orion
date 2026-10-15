/**
 * The app's mark: the O, a ring that fills clockwise from the dot at the top
 * as the steps of the goals in play get done.
 */

const R = 12
const LOOP = 2 * Math.PI * R

/** `done` is the share of steps done, 0 to 1; null while the plan is loading. */
export function Ring({ done, size = 30 }: { done: number | null; size?: number }) {
  const share = done === null ? 0 : Math.min(1, Math.max(0, done))
  return (
    <svg className="ring" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle className="ring-track" cx="16" cy="16" r={R} />
      {share > 0 && (
        <circle
          className="ring-done"
          cx="16"
          cy="16"
          r={R}
          transform="rotate(-90 16 16)"
          strokeDasharray={`${share * LOOP} ${LOOP}`}
        />
      )}
      {done !== null && <circle className="ring-start" cx="16" cy={16 - R} r="3.2" />}
    </svg>
  )
}
