# Sources, bridges and what a browser can't do

UpScout runs entirely in your browser. That's what makes it install on a phone
with no account and no server — and it's also the one thing you have to work
around, because a web page may only fetch from a server that gives it
permission (a CORS header). `upwork.com` doesn't give that permission to
anyone, so pasting an Upwork feed URL straight into Sources will usually fail
with "couldn't reach www.upwork.com". That's the browser's rule, not a bug
here, and no amount of code in the page can get past it.

There are three ways to get jobs in. Start with the first.

## 1. Paste them in (no setup)

**Search → Paste jobs in.**

Open your Upwork search or your saved-search feed, select all, copy, paste.
The app takes:

- feed XML (RSS or Atom),
- a JSON array of jobs,
- `{ "jobs": [...] }`.

Everything after that — ranking, letters, the queue — works the same as it does
with a live source. On a phone this takes about ten seconds and it's genuinely
how the app is usable on day one.

## 2. A bridge you run

A bridge is a few lines of server code that fetches on your behalf and adds the
header the browser needs. `connector/worker.js` in this folder is a complete
one for Cloudflare Workers:

```bash
wrangler deploy connector/worker.js
wrangler secret put UPSCOUT_TOKEN     # a password you invent
wrangler secret put UPWORK_FEED_URL   # your saved-search RSS URL
```

Then in the app: **You → Sources → Add a source**, kind *Saved-search feed
(RSS)*, URL `https://your-worker.workers.dev/jobs`, token the one you set.

### The JSON shape

If you'd rather have your bridge do the parsing, return this from `/jobs` and
choose the *Bridge returning JSON* kind. Every field except `title` is
optional, and unknown fields are ignored:

```json
{
  "jobs": [
    {
      "id": "~01abc123",
      "title": "React dashboard for a logistics tool",
      "description": "We need an internal dashboard…",
      "url": "https://www.upwork.com/jobs/~01abc123",
      "postedAt": "2026-03-10T10:00:00Z",
      "type": "hourly",
      "hourlyMin": 45,
      "hourlyMax": 70,
      "skills": ["React", "TypeScript"],
      "category": "Web Development",
      "proposals": 4,
      "connects": 8,
      "experienceLevel": "expert",
      "client": {
        "country": "United States",
        "paymentVerified": true,
        "rating": 4.9,
        "totalSpend": 52000,
        "hires": 20,
        "jobsPosted": 25
      }
    }
  ]
}
```

Fixed-price jobs use `"type": "fixed"` with `"amount": 1500`.

The app appends `q`, `skills` and `hours` from your criteria to the bridge URL,
so one bridge can serve several searches.

**Missing beats wrong.** Leave a field out and the ranking marks that factor
"unknown" and works around it; send a made-up client rating and it ranks on a
fiction. There is no penalty for a sparse job.

## 3. The Upwork API

The above-board route, if you can get a key: register an app with Upwork, get
an OAuth access token, and point a source of kind *Upwork API* at a proxy that
forwards to `https://api.upwork.com/graphql` with your token attached. (The API
doesn't send CORS headers either, hence the proxy.) The query the app sends is
in `src/services/sources/upworkApi.ts`.

## Sending applications

Upwork publishes no endpoint that submits a proposal. So:

- **By hand (default).** The app copies your letter and opens the job's apply
  page. You paste, set your terms, submit. The queue tracks what's outstanding.
- **Through your bridge.** If you run something that can submit, put its URL
  in **You → Sending** and the queue POSTs to it:

  ```json
  { "jobId": "~01abc", "jobUrl": "https://…", "jobTitle": "…", "coverLetter": "…", "connects": 8 }
  ```

  Answer `{"ok": true}` and the application is marked sent; answer
  `{"error": "…"}` and it's marked failed and kept, never silently dropped.
  The submission is not retried, because a retried proposal is a duplicate
  proposal.

The `/apply` handler in `connector/worker.js` is a stub returning 501 on
purpose. Automating submissions to Upwork is a decision about your own account
and Upwork's terms; if you make it, you should make it in code you've read.
