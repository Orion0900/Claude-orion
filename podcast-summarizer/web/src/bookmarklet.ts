/**
 * A bookmarklet the user keeps in Safari's favourites. Tapped on a YouTube
 * watch page it reads the open transcript panel, creates a PodBrief job, posts
 * the transcript, and opens the summary — so the whole "select all, copy,
 * switch apps, paste" dance collapses into one tap.
 *
 * It runs on youtube.com, so it reaches the API cross-origin; the /api routes
 * send permissive CORS headers for exactly this reason.
 */

/** Source of the bookmarklet, with API_BASE substituted in at build time. */
const SOURCE = `(async () => {
  const BASE = '__API_BASE__';
  const note = (msg) => {
    let el = document.getElementById('podbrief-note');
    if (!el) {
      el = document.createElement('div');
      el.id = 'podbrief-note';
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:24px;z-index:2147483647;background:#6b4dff;color:#fff;font:600 15px -apple-system,system-ui,sans-serif;padding:14px 16px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);text-align:center';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    return el;
  };
  try {
    const id = new URL(location.href).searchParams.get('v') || location.pathname.split('/').pop();
    if (!id) return note('Open a YouTube video first.');

    // Open the transcript panel if it is closed, then wait for it to fill.
    const rows = () => document.querySelectorAll('ytd-transcript-segment-renderer');
    if (!rows().length) {
      const btn = [...document.querySelectorAll('button,tp-yt-paper-button,yt-button-shape button')]
        .find((b) => /transcript/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
      if (btn) { btn.click(); note('Opening the transcript…'); }
      for (let i = 0; i < 40 && !rows().length; i++) await new Promise((r) => setTimeout(r, 250));
    }

    let text = [...rows()].map((r) => {
      const t = (r.querySelector('.segment-timestamp') || {}).textContent;
      const x = (r.querySelector('.segment-text') || {}).textContent;
      return t && x ? t.trim() + '\\n' + x.trim() : '';
    }).filter(Boolean).join('\\n');

    // Fall back to scraping visible text for timestamp lines.
    if (text.split('\\n').length < 20) {
      const lines = (document.body.innerText || '').split('\\n').map((l) => l.trim());
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        if (/^(?:\\d{1,2}:)?\\d{1,2}:\\d{2}$/.test(lines[i]) && lines[i + 1]) out.push(lines[i], lines[i + 1]);
      }
      if (out.length > text.split('\\n').length) text = out.join('\\n');
    }
    if (text.split('\\n').length < 20) {
      return note('Open the transcript panel first (…more → Show transcript), then tap again.');
    }

    note('Sending ' + Math.round(text.length / 1000) + 'k of transcript to PodBrief…');
    const post = (path, body) => fetch(BASE + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then((r) => r.json());

    const job = await post('/api/jobs', {
      url: 'https://www.youtube.com/watch?v=' + id,
      transcript: text,
      transcriptSource: 'phone',
    });
    if (!job || !job.id) throw new Error((job && job.error) || 'PodBrief did not accept the transcript');
    note('Done. Opening PodBrief…');
    location.href = BASE + '/#/job/' + job.id;
  } catch (err) {
    note('PodBrief: ' + (err && err.message ? err.message : err));
  }
})()`

/** The installable `javascript:` URL, pointed at wherever this app's API lives. */
export function bookmarkletUrl(apiBase: string): string {
  const base = (apiBase || location.origin).replace(/\/+$/, '')
  return `javascript:${encodeURIComponent(SOURCE.replace('__API_BASE__', base))}`
}
