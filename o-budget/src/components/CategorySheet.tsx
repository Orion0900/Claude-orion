import { useRef, useState } from 'react'
import {
  addItem,
  BUCKETS,
  categoryTotal,
  investingTotal,
  livingTotal,
  perPaycheck,
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

type Update = (change: (b: Budget) => Budget) => void

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
  const investing = c.bucket === 'invest' || c.bucket === 'self'
  const group = investing ? investingTotal(b) : livingTotal(b)
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
          <dt>Of {investing ? 'Investing' : 'Living'}</dt>
          <dd className="num">{group > 0 ? percent(total / group) : '–'}</dd>
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
        <span className="field-label">Goes to</span>
        <span className="select">
          <select id="category-bucket" value={c.bucket} onChange={(e) => update((x) => setCategoryBucket(x, id, e.target.value as Bucket))}>
            {BUCKETS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.id === 'fixed' ? `${o.label} (${b.cards.fixed})` : o.id === 'variable' ? `${o.label} (${b.cards.variable})` : o.label}
              </option>
            ))}
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
