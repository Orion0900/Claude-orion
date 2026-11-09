import { useLayoutEffect, useRef, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'

/** Enter leaves a one-line field, the way the keyboard's Done key does. */
export const doneOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

/** A text box that grows with what's typed, so a long step reads whole while it's edited. */
export function GrowingText({ value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const box = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={box} rows={1} value={value} {...rest} />
}
