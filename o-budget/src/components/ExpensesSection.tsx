import { useRef, useState, type CSSProperties } from 'react'
import {
  addItem,
  categoryTotal,
  expensesTotal,
  living,
  livingLeft,
  perPaycheck,
  selfTotal,
  setCategoryBucket,
  updateCategory,
  updateItem,
  type Bucket,
  type Budget,
} from '../lib/budget'
import { money, percent } from '../lib/money'
import { MoneyInput } from './Fields'
import { ChevronIcon, CloseIcon, PlusIcon, TrashIcon } from './Icons'
import { Sheet } from './Sheet'
import { StatusPill } from './StatusPill'

type Update = (change: (b: Budget) => Budget) => void

/** The words that change between Living expenses and self investment. */
const WORDS: Record<Bucket, { title: string; from: string; empty: string; id: string }> = {
  living: {
    title: 'Living expenses',
    from: 'Living',
    empty: 'No expenses yet. Add a category like Rent or Food, and the bar fills against Living.',
    id: 'expenses',
  },
  self: {
    title: 'Self investment',
    from: 'Investing',
    empty: 'Nothing yet. Add what you invest in yourself, like coaching or courses; it comes out of Investing.',
    id: 'self',
  },
}

/**
 * Where Living goes, or the self investment paid from Investing: the total
 * against what it comes out of, then each category with a bar for its
 * share. Tapping a category opens its details.
 */
export function ExpensesSection({
  budget: b,
  bucket = 'living',
  onOpen,
  onAdd,
}: {
  budget: Budget
  bucket?: Bucket
  onOpen: (id: string) => void
  onAdd: () => void
}) {
  const words = WORDS[bucket]
  const categories = b.categories.filter((c) => c.bucket === bucket)
  const total = bucket === 'living' ? expensesTotal(b) : selfTotal(b)
  const budgeted = bucket === 'living' ? living(b) : b.investing
  const left = bucket === 'living' ? livingLeft(b) : budgeted - total
  // Bars are shares of Living, or of the expenses when there's no Living to share.
  const whole = budgeted > 0 ? budgeted : total
  // The meter runs to whichever is bigger, so spending past Living shows as overrun.
  const scale = Math.max(total, budgeted, 0)
  const within = scale > 0 ? Math.min(total, Math.max(budgeted, 0)) / scale : 0
  const over = scale > 0 && total > budgeted ? (total - Math.max(budgeted, 0)) / scale : 0

  return (
    <section id={words.id} className={`section ${bucket === 'living' ? 'expenses' : 'self-invest'}`} aria-labelledby={`${words.id}-title`}>
      <div className="section-head">
        <h2 className="eyebrow" id={`${words.id}-title`}>
          {words.title}
        </h2>
        {categories.length > 0 && budgeted >= 0 && (bucket === 'living' ? <StatusPill left={left} /> : <StatusPill left={left} spare="for markets" />)}
      </div>

      <div className="spent">
        <span className="spent-total">{money(total)}</span>
        <span className="spent-of num">
          of {money(budgeted)} for {words.from}
        </span>
      </div>

      <div
        className="meter"
        role="img"
        aria-label={`${words.title} ${money(total)} of ${money(budgeted)} for ${words.from}${left < 0 ? `, ${money(-left)} over` : ''}`}
      >
        <div className="meter-track">
          {within > 0 && <span className="meter-fill" style={{ width: `${within * 100}%` }} />}
          {over > 0 && <span className="meter-over" style={{ left: `${within * 100}%`, width: `${over * 100}%` }} />}
        </div>
        {over > 0 && <span className="meter-mark" style={{ left: `${within * 100}%` }} />}
      </div>

      {categories.length === 0 ? (
        <p className="note-line">{words.empty}</p>
      ) : (
        <ul className="cats">
          {categories.map((c) => {
            const amount = categoryTotal(c)
            const share = whole > 0 ? amount / whole : 0
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

      <div className="actions">
        <button type="button" className="btn" onClick={onAdd}>
          <PlusIcon />
          {bucket === 'living' ? 'Add category' : 'Add self investment'}
        </button>
      </div>
    </section>
  )
}

/**
 * A category's popout: its name and amount, what it comes to a paycheck and
 * a year, the items it's made of (each subscription, say), and notes.
 */
export function CategorySheet({
  budget: b,
  id,
  fresh,
  update,
  onRemove,
  onRemoveItem,
  onClose,
}: {
  budget: Budget
  id: string
  fresh: boolean
  update: Update
  onRemove: (id: string) => void
  onRemoveItem: (categoryId: string, itemId: string) => void
  onClose: () => void
}) {
  const c = b.categories.find((x) => x.id === id)
  const focusName = useRef(fresh)
  const [focusItem, setFocusItem] = useState<string | null>(null)
  if (!c) return null

  const total = categoryTotal(c)
  const budgeted = c.bucket === 'self' ? b.investing : living(b)
  const hasItems = c.items.length > 0
  const label = c.name.trim() || 'New category'

  const add = () => {
    let added = ''
    update((x) => {
      const [next, itemId] = addItem(x, id)
      added = itemId
      return next
    })
    setFocusItem(added)
  }

  return (
    <Sheet label={label} onClose={onClose}>
      <div className="sheet-head">
        <input
          id="category-name"
          className="sheet-title"
          type="text"
          value={c.name}
          placeholder="Category name"
          aria-label="Category name"
          enterKeyHint="done"
          autoFocus={focusName.current}
          onChange={(e) => update((x) => updateCategory(x, id, { name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="sheet-amount">
        {hasItems ? (
          <span className="sheet-total num">{money(total)}</span>
        ) : (
          <MoneyInput id="category-amount" className="sheet-money" value={c.amount} label={`${label} a month`} onChange={(n) => update((x) => updateCategory(x, id, { amount: n }))} />
        )}
        <span className="sheet-unit">{hasItems ? `a month, from the ${c.items.length} items below` : 'a month'}</span>
      </div>

      <dl className="facts">
        <div>
          <dt>A paycheck</dt>
          <dd className="num">{money(perPaycheck(b, total))}</dd>
        </div>
        <div>
          <dt>A year</dt>
          <dd className="num">{money(total * 12)}</dd>
        </div>
        <div>
          <dt>Of {c.bucket === 'self' ? 'Investing' : 'Living'}</dt>
          <dd className="num">{budgeted > 0 ? percent(total / budgeted) : '–'}</dd>
        </div>
      </dl>

      <div className="details">
        <h3 className="eyebrow">Details</h3>
        {hasItems ? (
          <ul className="items">
            {c.items.map((item) => (
              <li key={item.id} className="item">
                <input
                  className="item-name"
                  type="text"
                  value={item.name}
                  placeholder="Name"
                  aria-label="Item name"
                  enterKeyHint="next"
                  autoFocus={item.id === focusItem}
                  onChange={(e) => update((x) => updateItem(x, id, item.id, { name: e.target.value }))}
                />
                <MoneyInput className="item-money" value={item.amount} label={`${item.name || 'Item'} a month`} onChange={(n) => update((x) => updateItem(x, id, item.id, { amount: n }))} />
                <button type="button" className="icon-btn" aria-label={`Remove ${item.name || 'item'}`} onClick={() => onRemoveItem(id, item.id)}>
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note-line">List what this is made of, like each subscription, and the amount becomes their total.</p>
        )}
        <button type="button" className="btn" onClick={add}>
          <PlusIcon />
          {hasItems ? 'Add item' : 'Add details'}
        </button>
      </div>

      <label className="field">
        <span className="field-label">Comes out of</span>
        <span className="select">
          <select id="category-bucket" value={c.bucket} onChange={(e) => update((x) => setCategoryBucket(x, id, e.target.value as Bucket))}>
            <option value="living">Living</option>
            <option value="self">Investing, as self investment</option>
          </select>
          <ChevronIcon />
        </span>
      </label>

      <label className="field notes">
        <span className="eyebrow">Notes</span>
        <textarea
          id="category-note"
          className="text-input"
          rows={2}
          value={c.note}
          placeholder="Due dates, accounts, anything to remember"
          onChange={(e) => update((x) => updateCategory(x, id, { note: e.target.value }))}
        />
      </label>

      <div className="sheet-row">
        <button type="button" className="btn danger" onClick={() => onRemove(id)}>
          <TrashIcon />
          Delete category
        </button>
      </div>
    </Sheet>
  )
}
