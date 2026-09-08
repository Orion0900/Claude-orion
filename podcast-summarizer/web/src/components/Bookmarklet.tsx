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
        Set this up once and summarizing an episode is: open the transcript, tap the bookmark. No copying, no pasting, no
        switching apps.
      </p>
      <button className="primary wide" onClick={() => void copy()}>
        {copied ? 'Copied ✓' : 'Copy the bookmarklet'}
      </button>
      <ol className="plain steps-text small">
        <li>Tap the button above to copy it.</li>
        <li>In Safari, open any page and tap <strong>Share → Add Bookmark</strong>. Name it <strong>PodBrief</strong>, save it to <strong>Favourites</strong>.</li>
        <li>Tap the address bar, then <strong>Edit</strong> (bottom right of the favourites grid). Tap your PodBrief bookmark.</li>
        <li>Clear the <strong>Address</strong> field and paste. Tap <strong>Done</strong>.</li>
      </ol>
      <h4>Using it</h4>
      <ol className="plain steps-text small">
        <li>Open a YouTube episode in Safari, desktop site, transcript panel open.</li>
        <li>Tap the address bar, then your <strong>PodBrief</strong> favourite.</li>
        <li>It sends the transcript and opens the summary here.</li>
      </ol>
    </section>
  )
}
