/**
 * A bookmarklet the user keeps in Safari's favourites. Tapped on any
 * youtube.com page it collects the episode's captions and hands them to
 * PodBrief, then opens the summary.
 *
 * Why a bookmarklet rather than a button inside PodBrief: a page can only read
 * another site with that site's permission, and YouTube gives none. Code that
 * runs *on* youtube.com has no such limit — and it carries the phone's own
 * address, which YouTube serves happily while it refuses a cloud server.
 *
 * It fetches the watch page relative to whatever YouTube origin it is on
 * (m.youtube.com and www.youtube.com are different origins, so a relative URL
 * is the only same-origin form), reads the caption track list out of the
 * player data embedded in that HTML, and downloads the track. That means the
 * transcript panel need not be open, the desktop site is not required, and
 * nothing has to be selected or copied.
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

  // The JSON blob is followed by other script text, so match braces rather
  // than trusting a lazy regex to find its end.
  const carveJson = (html, key) => {
    const at = html.indexOf(key);
    if (at < 0) return null;
    const start = html.indexOf('{', at);
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch (e) { return null; }
      }
    }
    return null;
  };

  const pickTrack = (tracks) => {
    const score = (t) => (t.kind === 'asr' ? 0 : 4) + (/^en/i.test(t.languageCode || '') ? 2 : 0);
    return tracks.slice().sort((a, b) => score(b) - score(a))[0];
  };

  const stamp = (s) => {
    const t = Math.max(0, Math.floor(s));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
  };

  try {
    if (!/(^|\\.)youtube\\.com$/.test(location.hostname)) {
      return note('Open a YouTube video first, then tap this.');
    }
    const id = new URL(location.href).searchParams.get('v')
      || (location.pathname.match(/\\/(?:shorts|live|embed|v)\\/([A-Za-z0-9_-]{11})/) || [])[1];
    if (!id) return note('Open a specific video first, then tap this.');

    note('Reading the captions…');
    let lines = [];

    // Relative URL: same origin whether this is m.youtube.com or www.
    for (const path of ['/watch?v=' + id + '&hl=en', '/watch?v=' + id + '&hl=en&app=desktop']) {
      try {
        const html = await (await fetch(path, { credentials: 'include' })).text();
        const pr = carveJson(html, 'ytInitialPlayerResponse');
        const tracks = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer
          ? pr.captions.playerCaptionsTracklistRenderer.captionTracks || []
          : [];
        const track = pickTrack(tracks.filter((t) => t && t.baseUrl));
        if (!track) continue;
        const url = track.baseUrl + (track.baseUrl.indexOf('fmt=') < 0 ? '&fmt=json3' : '');
        const data = await (await fetch(url, { credentials: 'include' })).json();
        lines = (data.events || [])
          .filter((e) => e.segs && e.tStartMs !== undefined)
          .map((e) => {
            const text = e.segs.map((s) => s.utf8 || '').join('').replace(/\\s+/g, ' ').trim();
            return text ? stamp(e.tStartMs / 1000) + '\\n' + text : '';
          })
          .filter(Boolean);
        if (lines.length > 10) break;
      } catch (e) {
        /* try the next shape */
      }
    }

    // If YouTube changed shape, fall back to the transcript panel if it is open.
    if (lines.length <= 10) {
      lines = [].slice.call(document.querySelectorAll('ytd-transcript-segment-renderer')).map((r) => {
        const t = (r.querySelector('.segment-timestamp') || {}).textContent;
        const x = (r.querySelector('.segment-text') || {}).textContent;
        return t && x ? t.trim() + '\\n' + x.trim() : '';
      }).filter(Boolean);
    }
    if (lines.length <= 10) {
      return note('No captions found for this video.');
    }

    const text = lines.join('\\n');
    note('Sending ' + lines.length + ' caption lines to PodBrief…');
    const res = await fetch(BASE + '/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://www.youtube.com/watch?v=' + id,
        transcript: text,
        transcriptSource: 'phone',
      }),
    }).then((r) => r.json());
    if (!res || !res.id) throw new Error((res && res.error) || 'PodBrief did not accept the transcript');
    note('Done. Opening PodBrief…');
    location.href = BASE + '/#/job/' + res.id;
  } catch (err) {
    note('PodBrief: ' + (err && err.message ? err.message : err));
  }
})()`

/** The installable `javascript:` URL, pointed at wherever this app's API lives. */
export function bookmarkletUrl(apiBase: string): string {
  const base = (apiBase || location.origin).replace(/\/+$/, '')
  return `javascript:${encodeURIComponent(SOURCE.replace('__API_BASE__', base))}`
}
