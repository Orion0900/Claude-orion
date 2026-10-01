import { CANONICAL_VERTICES } from '../../face/canonical'
import { BROW_LEFT, BROW_RIGHT, EYE_LEFT, EYE_RIGHT, FACE_OVAL, LIPS_OUTER } from '../../face/indices'

const at = (i: number) => ({ x: CANONICAL_VERTICES[i * 3], y: -CANONICAL_VERTICES[i * 3 + 1] })
const path = (ids: number[], close = false) =>
  ids.map((i, k) => `${k ? 'L' : 'M'}${at(i).x.toFixed(2)} ${at(i).y.toFixed(2)}`).join(' ') + (close ? ' Z' : '')

const eye = (e: typeof EYE_RIGHT) => path([...e.upper, ...[...e.lower].reverse().slice(1)], true)
const brow = (b: typeof BROW_RIGHT) => path([...b.upper, ...[...b.lower].reverse()], true)
const NOSE = path([168, 6, 197, 195, 5, 4])
const NOSTRILS = path([129, 64, 98, 2, 327, 294, 358])

// Thirds of the average face, the hairline placed by the classical canon.
const G = (at(9).y + at(8).y) / 2
const SN = at(2).y
const ME = at(152).y
const TR = G - (SN - G)
const LEFT = at(127).x
const RIGHT = at(356).x

/**
 * The average face — MediaPipe's canonical mesh — drawn as a line portrait
 * with its facial thirds, for the welcome and empty screens.
 */
export function FaceArt({ className, animate = true }: { className?: string; animate?: boolean }) {
  const lines = [TR, G, SN, ME]
  return (
    <svg className={className} viewBox={`${LEFT - 3.5} ${TR - 2} ${RIGHT - LEFT + 7} ${ME - TR + 3.5}`} role="img" aria-label="A face divided into thirds">
      <style>{`
        .fa-draw { stroke-dasharray: 80; stroke-dashoffset: ${animate ? 80 : 0}; animation: fa-draw 2.2s ease forwards; }
        .fa-line { opacity: ${animate ? 0 : 1}; animation: fa-fade 0.6s ease forwards; }
        @keyframes fa-draw { to { stroke-dashoffset: 0; } }
        @keyframes fa-fade { to { opacity: 1; } }
      `}</style>
      <g fill="none" stroke="var(--text-2)" strokeWidth={0.12} strokeLinejoin="round" strokeLinecap="round">
        <path className="fa-draw" d={path(FACE_OVAL, true)} />
        <path className="fa-draw" d={eye(EYE_RIGHT)} />
        <path className="fa-draw" d={eye(EYE_LEFT)} />
        <path className="fa-draw" d={brow(BROW_RIGHT)} />
        <path className="fa-draw" d={brow(BROW_LEFT)} />
        <path className="fa-draw" d={NOSE} />
        <path className="fa-draw" d={NOSTRILS} />
        <path className="fa-draw" d={path(LIPS_OUTER, true)} />
      </g>
      <g stroke="var(--accent)" strokeWidth={0.09} strokeDasharray="0.45 0.3">
        {lines.map((y, i) => (
          <line key={i} className="fa-line" style={{ animationDelay: `${1.2 + i * 0.18}s` }} x1={LEFT - 1.5} x2={RIGHT + 1.5} y1={y} y2={y} />
        ))}
      </g>
      <g fill="var(--accent)" className="fa-line" style={{ animationDelay: '1.9s' }}>
        {[33, 133, 362, 263, 129, 358, 61, 291].map((i) => (
          <circle key={i} cx={at(i).x} cy={at(i).y} r={0.22} />
        ))}
      </g>
      <g fill="var(--text-3)" fontSize={0.95} fontFamily="var(--sans)" className="fa-line" style={{ animationDelay: '2s' }}>
        {['⅓', '⅓', '⅓'].map((t, i) => (
          <text key={i} x={RIGHT + 2} y={(lines[i] + lines[i + 1]) / 2 + 0.35}>
            {t}
          </text>
        ))}
      </g>
    </svg>
  )
}
