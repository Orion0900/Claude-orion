/** Tiny DOM helpers. Text always goes in as textContent, never as HTML. */

type Child = Node | string | number | null | undefined | false

export interface Props {
  class?: string
  text?: string
  attrs?: Record<string, string>
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>
  style?: Partial<CSSStyleDeclaration>
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props?.class) node.className = props.class
  if (props?.text !== undefined) node.textContent = props.text
  if (props?.attrs) for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v)
  if (props?.style) Object.assign(node.style, props.style)
  if (props?.on) for (const [type, fn] of Object.entries(props.on)) if (fn) node.addEventListener(type, fn)
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(typeof child === 'number' ? String(child) : child)
  }
  return node
}

export function button(label: string | Node, className: string, onClick: (e: Event) => void, attrs?: Record<string, string>): HTMLButtonElement {
  const b = h('button', { class: `btn ${className}`.trim(), attrs: { type: 'button', ...attrs }, on: { click: onClick } })
  b.append(label)
  return b
}

/** A labelled on/off switch. */
export function toggle(label: string, hint: string, value: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const input = h('input', { attrs: { type: 'checkbox', role: 'switch' } })
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  return h(
    'label',
    { class: 'row toggle' },
    h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: label }), hint ? h('span', { class: 'row-hint', text: hint }) : null),
    input,
    h('span', { class: 'switch', attrs: { 'aria-hidden': 'true' } }),
  )
}

/** A labelled slider showing its value. */
export function slider(
  label: string,
  hint: string,
  options: { min: number; max: number; step: number; value: number; format: (v: number) => string },
  onChange: (v: number) => void,
): HTMLLabelElement {
  const output = h('output', { text: options.format(options.value) })
  const input = h('input', {
    attrs: { type: 'range', min: String(options.min), max: String(options.max), step: String(options.step) },
  })
  input.value = String(options.value)
  input.addEventListener('input', () => {
    output.textContent = options.format(Number(input.value))
    onChange(Number(input.value))
  })
  return h(
    'label',
    { class: 'row slider' },
    h('span', { class: 'row-text' }, h('span', { class: 'row-label' }, label, ' ', output), hint ? h('span', { class: 'row-hint', text: hint }) : null),
    input,
  )
}

/** A row of mutually exclusive choices. */
export function segmented<T extends string>(
  choices: { value: T; label: string; disabled?: boolean }[],
  value: T,
  onChange: (v: T) => void,
  label?: string,
): HTMLDivElement {
  const group = h('div', { class: 'segmented', attrs: { role: 'radiogroup', ...(label ? { 'aria-label': label } : {}) } })
  const buttons = choices.map((c) => {
    const b = h('button', {
      class: 'segment',
      text: c.label,
      attrs: { type: 'button', role: 'radio', 'aria-checked': String(c.value === value) },
    })
    b.disabled = !!c.disabled
    b.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-checked', String(other === b))
      onChange(c.value)
    })
    return b
  })
  group.append(...buttons)
  return group
}

export function formatTime(seconds: number): string {
  if (!(seconds > 0)) return ''
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function stars(count: number, max = 5): string {
  return '★'.repeat(Math.max(0, Math.min(max, count))) + '☆'.repeat(Math.max(0, max - Math.max(0, count)))
}
