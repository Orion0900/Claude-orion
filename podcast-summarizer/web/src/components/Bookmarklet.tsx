import { useState } from 'react'
import { bookmarkletUrl } from '../bookmarklet'
import { getApiBase } from '../api'

/**
 * Installing a bookmarklet on iOS is a genuinely awkward, little-known dance:
 * you cannot type a javascript: URL into the address bar, so you bookmark any
 * page and then edit that bookmark's address. These steps spell it out.
 */
export function Bookmarklet() {
  const [copied, setCopied] = useState(false)
  const url = bookmarkletUrl(getApiBase())

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="card">
      <h3>One-tap grab from YouTube</h3>
      <p className="muted small">
        Set this up once. After that, summarizing an episode is a single tap on any YouTube page — no desktop mode, no
        transcript panel, nothing to copy.
      </p>
      <button className="primary wide" onClick={() => void copy()}>
        {copied ? 'Copied ✓' : 'Copy the bookmarklet'}
      </button>
      <h4>Set up (once)</h4>
      <ol className="plain steps-text small">
        <li>Tap the button above to copy it.</li>
        <li>In Safari, on any page, tap <strong>Share → Add Bookmark</strong>. Name it <strong>PodBrief</strong> and save it to <strong>Favourites</strong>.</li>
        <li>Tap the address bar, then <strong>Edit</strong> under the favourites grid. Tap your PodBrief bookmark.</li>
        <li>Clear the <strong>Address</strong> field, paste, and tap <strong>Done</strong>.</li>
      </ol>
      <h4>Every episode after that</h4>
      <ol className="plain steps-text small">
        <li>Open the episode on youtube.com in Safari.</li>
        <li>Tap the address bar, then your <strong>PodBrief</strong> favourite.</li>
        <li>It reads the captions, sends them, and opens the summary.</li>
      </ol>
    </section>
  )
}
