import { useEffect, useState } from 'react'
import { confettiBurst, prefersReducedMotion } from '../lib/motion'

/**
 * A shower of confetti, fired by bumping `trigger`. Holing out is the one
 * moment in a round worth celebrating, so it gets the only celebration in
 * the app — and it cleans itself up so nothing is left animating.
 */
export function Confetti({ trigger }: { trigger: number }) {
  const [pieces, setPieces] = useState<ReturnType<typeof confettiBurst>>([])

  useEffect(() => {
    if (trigger === 0 || prefersReducedMotion()) return
    setPieces(confettiBurst(46, trigger + 1))
    const timer = setTimeout(() => setPieces([]), 2400)
    return () => clearTimeout(timer)
  }, [trigger])

  if (pieces.length === 0) return null
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece, i) => (
        <span
          key={`${trigger}-${i}`}
          className={`confetti-piece c${piece.color}`}
          style={{
            left: `${piece.x}%`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            ['--spin' as string]: `${piece.spin}deg`,
            ['--drift' as string]: `${piece.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
