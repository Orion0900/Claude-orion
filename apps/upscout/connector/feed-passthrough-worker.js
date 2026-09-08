/**
 * A bridge for UpScout, in one file.
 *
 * The app runs entirely in your browser, and a browser may only fetch from a
 * server that says it's allowed to — upwork.com doesn't. This worker sits in
 * the middle: it fetches on the server side, where that rule doesn't apply,
 * and hands the result back with the header the browser needs.
 *
 * Deploy it anywhere that runs a fetch handler (Cloudflare Workers, Deno
 * Deploy, a Node server with a small shim). Then in UpScout: Settings →
 * Sources → add a source pointing at https://your-worker.example.com/jobs.
 * As written it passes the feed through unchanged, so choose the
 * "Saved-search feed (RSS)" kind; if you change it to return
 * `{ "jobs": [...] }` instead, choose "Bridge returning JSON".
 *
 *   wrangler deploy connector/worker.js
 *   wrangler secret put UPSCOUT_TOKEN
 *   wrangler secret put UPWORK_FEED_URL     # your saved-search RSS URL
 *
 * On the /apply endpoint: it is deliberately a stub that returns 501. Upwork
 * publishes no endpoint that submits a proposal, so anything that submits one
 * is automation you are choosing to run against your own account, under
 * Upwork's terms and at your own risk. That decision is yours to make
 * explicitly, in code you have read — not something to inherit from a
 * template. Everything up to that point — finding, ranking, drafting — is
 * done for you either way.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const url = new URL(request.url)
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (env.UPSCOUT_TOKEN && token !== env.UPSCOUT_TOKEN) return json({ error: 'Unauthorized' }, 401)

    if (url.pathname === '/jobs') {
      const feed = env.UPWORK_FEED_URL
      if (!feed) return json({ error: 'UPWORK_FEED_URL is not set' }, 500)

      // The app's own query is forwarded, so one worker serves several searches.
      const target = new URL(feed)
      const query = url.searchParams.get('q')
      if (query) target.searchParams.set('q', query)

      const response = await fetch(target.toString(), {
        headers: { 'User-Agent': 'UpScout/0.1 (personal job search)', Accept: 'application/rss+xml, application/xml' },
      })
      if (!response.ok) return json({ error: `Upstream said ${response.status}` }, 502)

      // The app parses feed XML itself, so the simplest useful bridge is a
      // pass-through with the header added.
      return new Response(await response.text(), {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', ...CORS },
      })
    }

    if (url.pathname === '/apply' && request.method === 'POST') {
      const application = await request.json().catch(() => null)
      if (!application?.jobUrl) return json({ error: 'Expected { jobUrl, coverLetter }' }, 400)

      // Put your own submission here if you decide to run one. Return
      // { ok: true } on success, or { error: "..." } — UpScout marks the
      // application failed and leaves it in the queue rather than losing it.
      return json({ error: 'This bridge does not submit proposals; send it from the app by hand.' }, 501)
    }

    return json({ error: 'Not found' }, 404)
  },
}
