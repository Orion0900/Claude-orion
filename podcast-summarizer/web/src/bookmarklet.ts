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
    el.style.whiteSpace = 'pre-line';
    el.style.textAlign = 'center';
    return el;
  };
  const trail = [];

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

    const tracksFrom = (pr) => {
      const r = pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer;
      return ((r && r.captionTracks) || []).filter((t) => t && t.baseUrl);
    };

    const download = async (track) => {
      const url = track.baseUrl + (track.baseUrl.indexOf('fmt=') < 0 ? '&fmt=json3' : '');
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('track ' + res.status);
      const data = await res.json();
      return (data.events || [])
        .filter((e) => e.segs && e.tStartMs !== undefined)
        .map((e) => {
          const text = e.segs.map((s) => s.utf8 || '').join('').replace(/\\s+/g, ' ').trim();
          return text ? stamp(e.tStartMs / 1000) + '\\n' + text : '';
        })
        .filter(Boolean);
    };

    // 1. The watch page's embedded player data, fetched relative so it stays
    //    same-origin on both m.youtube.com and www.youtube.com.
    let html = '';
    try {
      html = await (await fetch('/watch?v=' + id + '&hl=en', { credentials: 'include' })).text();
      const tracks = tracksFrom(carveJson(html, 'ytInitialPlayerResponse'));
      trail.push('page: ' + tracks.length + ' tracks');
      if (tracks.length) lines = await download(pickTrack(tracks));
    } catch (e) {
      trail.push('page: ' + e.message);
    }

    // 2. YouTube's own player endpoint. The mobile page often omits caption
    //    tracks from the embedded blob but serves them here; the page's own
    //    client name, version and key are reused so the call looks native.
    if (lines.length <= 10) {
      try {
        const pick = (re, fallback) => (html.match(re) || [])[1] || fallback;
        const key = pick(/"INNERTUBE_API_KEY":"([^"]+)"/);
        const client = pick(/"INNERTUBE_CLIENT_NAME":"([^"]+)"/, 'MWEB');
        const version = pick(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/, '2.20240101.00.00');
        const res = await fetch('/youtubei/v1/player' + (key ? '?key=' + key : ''), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            videoId: id,
            contentCheckOk: true,
            racyCheckOk: true,
            context: { client: { clientName: client, clientVersion: version, hl: 'en', gl: 'US' } },
          }),
        });
        if (!res.ok) throw new Error('player ' + res.status);
        const tracks = tracksFrom(await res.json());
        trail.push('player: ' + tracks.length + ' tracks');
        if (tracks.length) lines = await download(pickTrack(tracks));
      } catch (e) {
        trail.push('player: ' + e.message);
      }
    }

    // 3. Whatever the open transcript panel has rendered. Desktop and mobile
    //    name their elements differently, so match on shape: a short
    //    timestamp followed by its line.
    if (lines.length <= 10) {
      const rows = document.querySelectorAll('ytd-transcript-segment-renderer, ytm-transcript-segment-renderer, [class*="transcript-segment"]');
      const fromRows = [].slice.call(rows).map((r) => {
        const text = (r.innerText || r.textContent || '').trim();
        const m = text.match(/^((?:\\d{1,2}:)?\\d{1,2}:\\d{2})\\s+([\\s\\S]+)$/);
        return m ? m[1] + '\\n' + m[2].replace(/\\s+/g, ' ').trim() : '';
      }).filter(Boolean);
      trail.push('panel: ' + fromRows.length + ' rows');
      if (fromRows.length > lines.length) lines = fromRows;
    }

    if (lines.length <= 10) {
      return note('No captions found.\\n' + trail.join('\\n') + '\\nOpen the transcript panel, or tell PodBrief this trail.');
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
