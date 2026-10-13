import { money } from '../lib/money'
import { AlertIcon, OkIcon } from './Icons'

/** How Living compares with the expenses: over, to spare, or exactly on. Icon and words, never color alone. */
export function StatusPill({ left }: { left: number }) {
  if (left < 0) {
    return (
      <span className="pill over">
        <AlertIcon />
        <span className="num">{money(-left)} over</span>
      </span>
    )
  }
  return (
    <span className="pill good">
      <OkIcon />
      <span className="num">{left === 0 ? 'Right on budget' : `${money(left)} to spare`}</span>
    </span>
  )
}
