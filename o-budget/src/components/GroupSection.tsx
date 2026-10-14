import type { CSSProperties } from 'react'
import { bucketTotal, categoryTotal, inBucket, monthlyIncome, perPaycheck, setCard, type Bucket, type Budget, type Category } from '../lib/budget'
import { money, percent } from '../lib/money'
import { ChevronIcon, PlusIcon } from './Icons'

type Update = (change: (b: Budget) => Budget) => void

/** Largest monthly amount first; ties keep their order. */
const bySize = (cs: Category[]) => [...cs].sort((x, y) => categoryTotal(y) - categoryTotal(x))

type Group = 'investing' | 'living'

const GROUPS: Record<Group, { title: string; parts: { bucket: Bucket; title: string; hint: string; empty: string }[] }> = {
  investing: {
    title: 'Investing',
    parts: [
      { bucket: 'invest', title: 'Markets', hint: 'Grows in the projection', empty: 'Add an account, like VTI.' },
      { bucket: 'self', title: 'Self investment', hint: 'Paid from Investing, not grown', empty: 'Add coaching, courses and the like.' },
    ],
  },
  living: {
    title: 'Living',
    parts: [
      { bucket: 'fixed', title: 'Fixed', hint: 'Same each month', empty: 'Add rent, the car, subscriptions.' },
      { bucket: 'variable', title: 'Variable', hint: 'Watched on the card', empty: 'Add food, gas, random.' },
    ],
  },
}

/**
 * Investing or Living in detail: the total and its share of income, then
 * each half (markets and self investment; fixed and variable, with the
 * card each goes on) with its categories. Tap one for its popout.
 */
export function GroupSection({
  budget: b,
  group,
  update,
  onOpen,
  onAdd,
}: {
  budget: Budget
  group: Group
  update: Update
  onOpen: (id: string) => void
  onAdd: (bucket: Bucket) => void
}) {
  const g = GROUPS[group]
  const income = monthlyIncome(b)
  const total = bucketTotal(b, ...g.parts.map((p) => p.bucket))

  return (
    <section id={group} className={`section group group-${group}`} aria-labelledby={`${group}-title`}>
      <div className="section-head">
        <h2 className="eyebrow" id={`${group}-title`}>
          {g.title}
        </h2>
        <span className="section-aside num">{income > 0 ? `${percent(total / income)} of income` : ''}</span>
      </div>

      <div className="spent">
        <span className="spent-total num">{money(total)}</span>
        <span className="spent-of num">a month · {money(perPaycheck(b, total))} a paycheck</span>
      </div>

      {g.parts.map((p) => {
        // Living lists the biggest expenses first; Investing keeps its own order.
        const cats = group === 'living' ? bySize(inBucket(b, p.bucket)) : inBucket(b, p.bucket)
        const part = bucketTotal(b, p.bucket)
        const card = p.bucket === 'fixed' || p.bucket === 'variable' ? p.bucket : null
        return (
          <div key={p.bucket} className={`part part-${p.bucket}`}>
            <div className="part-head">
              <span className="part-title">
                <span className="swatch" aria-hidden="true" />
                {p.title}
              </span>
              <span className="part-total num">{money(part)}</span>
            </div>
            <div className="part-sub">
              {card ? (
                <label className="card-field">
                  <span>on</span>
                  <input
                    id={`card-${card}`}
                    className="card-name"
                    type="text"
                    value={b.cards[card]}
                    aria-label={`Card for ${p.title.toLowerCase()} spending`}
                    enterKeyHint="done"
                    onChange={(e) => update((x) => setCard(x, card, e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </label>
              ) : (
                <span>{p.hint}</span>
              )}
            </div>

            {cats.length === 0 ? (
              <p className="note-line">{p.empty}</p>
            ) : (
              <ul className="cats">
                {cats.map((c) => {
                  const amount = categoryTotal(c)
                  const share = total > 0 ? amount / total : 0
                  const name = c.name.trim() || 'Untitled'
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="cat"
                        onClick={() => onOpen(c.id)}
                        aria-label={`${name}, ${money(amount)} a month${c.items.length ? `, ${c.items.length} items` : ''}. Open details`}
                      >
                        <span className="cat-name">
                          <span className={`cat-name-text${c.name.trim() ? '' : ' placeholder'}`}>{name}</span>
                          {c.items.length > 0 && <span className="chip num">{c.items.length} items</span>}
                        </span>
                        <span className="cat-amount num">{money(amount)}</span>
                        <span className="chev">
                          <ChevronIcon />
                        </span>
                        <span className="cat-bar" aria-hidden="true">
                          <span className="bar-track">
                            <span className="bar-fill" style={{ '--w': `${Math.min(1, share) * 100}%` } as CSSProperties} />
                          </span>
                          <span className="bar-pct num">{percent(share)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <button type="button" className="add-line" onClick={() => onAdd(p.bucket)}>
              <PlusIcon />
              Add to {p.title.toLowerCase()}
            </button>
          </div>
        )
      })}
    </section>
  )
}
