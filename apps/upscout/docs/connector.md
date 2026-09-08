# Getting jobs in: the bridge, and the ways round it

UpScout runs entirely in your browser. That's what makes it install on a phone
with no account and no server — and it's also the one thing to work around,
because a web page may only fetch from a server that gives it permission (a
CORS header). `upwork.com` gives that permission to nobody, and Upwork's API
is OAuth2 with tokens that expire daily and refresh tokens that rotate, so
something outside the browser has to hold the connection.

That something is the bridge. Set it up once and **Refresh** works from then
on — on the laptop, on the phone, with nothing to copy or paste.

## 1. The bridge (what you want)

[`connector/upwork-bridge`](../connector/upwork-bridge) is a ~250-line
Cloudflare Worker. Its README has the exact commands; the shape of it:

1. Get an Upwork API key (upwork.com → Settings → API access), with the
   callback URL pointing at your worker's `/callback`.
2. `wrangler deploy`, then set three secrets: your Upwork key, your Upwork
   secret, and a password you invent for the app to use.
3. Open the worker's URL, press **Connect Upwork**, approve.
4. In UpScout: **You → Sources → Add a source**, kind **UpScout bridge**, URL
   and token as above, press **Check connection**.

After that the worker holds the tokens and renews them by itself. The app
fetches when you open it, when you come back to it, every ten minutes while
you're looking (all adjustable under **You → Refreshing**), and whenever you
press Refresh.

Moving to your phone: **You → Move this to another device → Copy my settings**
with *Include bridge tokens* ticked, then paste it in on the phone. Nothing to
set up twice.

## 2. Paste jobs in (works this second)

**Search → Paste jobs in.** Open your Upwork search or saved-search feed,
select all, copy, paste. It takes feed XML, a JSON array of jobs, or
`{ "jobs": [...] }`. Everything downstream — ranking, letters, the queue —
behaves identically. Useful while your API application is pending, and on a
phone with nothing set up.

## 3. Anything else that can answer

The **JSON** source kind takes any endpoint returning the shape below, with
`q`, `skills` and `hours` appended from your criteria. Every field except
`title` is optional and unknown fields are ignored:

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

**Missing beats wrong.** Leave a field out and the ranking marks that factor
unknown and works around it; send a made-up client rating and it ranks on a
fiction. There is no penalty for a sparse job.

The **RSS** kind takes a feed URL directly, for a feed that is reachable from a
browser — your own, or one proxied by
[`connector/feed-passthrough-worker.js`](../connector/feed-passthrough-worker.js),
which is the CORS half of the bridge and nothing else. The **Upwork API** kind
posts the GraphQL query in `src/services/sources/upworkApi.ts` to a proxy that
attaches your own OAuth token.

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

The bridge's `/apply` returns 501 on purpose. Automating submissions to Upwork
is a decision about your own account and Upwork's terms; if you make it, make
it in code you've read.
