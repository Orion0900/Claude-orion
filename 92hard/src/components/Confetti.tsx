import { useEffect, useState } from 'react'

const COLORS = 4

interface Piece {
  x: number
  delay: number
  duration: number
  spin: number
  drift: number
  color: number
}

/** A small, repeatable scatter: the same burst for the same seed. */
function burst(count: number, seed: number): Piece[] {
  let s = seed * 9301 + 49297
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  return Array.from({ length: count }, () => ({
    x: rand() * 100,
    delay: rand() * 0.35,
    duration: 1.5 + rand() * 1.1,
    spin: 360 + rand() * 720,
    drift: (rand() - 0.5) * 140,
    color: Math.floor(rand() * COLORS),
  }))
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Confetti, fired by bumping `trigger`. Saved for a finished day and a
 * finished run: a party for every tap would stop meaning anything.
 */
export function Confetti({ trigger, count = 48 }: { trigger: number; count?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    if (trigger === 0 || prefersReducedMotion()) return
    setPieces(burst(count, trigger))
    const timer = setTimeout(() => setPieces([]), 3000)
    return () => clearTimeout(timer)
  }, [trigger, count])

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
