import { useMemo, type CSSProperties } from 'react'

const COLOURS = ['#4ade80', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#ffffff']

/**
 * A short burst of celebration on the finish screen. Pure CSS, drawn once, and
 * skipped entirely for anyone who has asked their phone for less motion.
 */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  // Scattered the same way every time: a fixed sequence, not Math.random, so
  // re-renders don't reshuffle it mid-fall.
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const spread = (i * 37) % 100
        return {
          left: `${spread}%`,
          delay: `${((i * 53) % 60) / 100}s`,
          duration: `${1.8 + ((i * 29) % 12) / 10}s`,
          drift: `${((i * 71) % 80) - 40}px`,
          spin: `${((i * 97) % 720) - 360}deg`,
          colour: COLOURS[i % COLOURS.length],
          wide: i % 3 === 0,
        }
      }),
    [pieces],
  )

  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((bit, i) => (
        <span
          key={i}
          className={bit.wide ? 'confetti-bit wide' : 'confetti-bit'}
          style={
            {
              left: bit.left,
              background: bit.colour,
              animationDelay: bit.delay,
              animationDuration: bit.duration,
              '--drift': bit.drift,
              '--spin': bit.spin,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
