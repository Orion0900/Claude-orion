# The UpScout bridge

Set this up once and UpScout's **Refresh** button pulls live Upwork jobs from
then on — on the laptop and on the phone, with nothing to copy, paste or
re-authorise.

It exists for two reasons. A browser may only fetch from a server that permits
it, and Upwork doesn't permit anyone; and Upwork's API is OAuth2, whose tokens
expire daily and whose refresh tokens rotate, so *something* has to hold them
and renew them quietly. This worker is that something. It's about 250 lines and
it runs free on Cloudflare's plan.

## What you need

- A Cloudflare account (free) and `npm i -g wrangler`.
- An Upwork API key: **upwork.com → Settings → API access → Create a new
  application**. Ask for the **Job Search** / marketplace scope. Set the
  callback URL to `https://upscout-bridge.<your-subdomain>.workers.dev/callback`
  — you'll know the exact hostname after the first deploy, and you can edit it
  on Upwork afterwards. Upwork issues a **key** (client id) and a **secret**.

## Setup, once

```bash
cd apps/upscout/connector/upwork-bridge

wrangler kv namespace create UPSCOUT      # paste the printed id into wrangler.toml
wrangler deploy                           # prints your worker URL

wrangler secret put UPWORK_CLIENT_ID      # the key Upwork gave you
wrangler secret put UPWORK_CLIENT_SECRET  # the secret Upwork gave you
wrangler secret put UPSCOUT_TOKEN         # a password you invent, for the app
```

Make sure the callback URL on your Upwork application is exactly
`<your worker URL>/callback`, then:

1. Open `<your worker URL>` in a browser. It shows a **Connect Upwork** button.
2. Press it, approve on Upwork, and you're done — the worker holds the
   connection and renews it by itself.
3. In UpScout: **You → Sources → Add a source**, kind **UpScout bridge**, URL
   `<your worker URL>`, token the `UPSCOUT_TOKEN` you invented. Press **Check**
   — it should say connected.

From then on: press Refresh, or just open the app, and jobs are there.

## What it exposes

| Route | What it does |
| --- | --- |
| `GET /` | A page showing whether it's connected, with the Connect button |
| `GET /connect` | Starts Upwork's authorisation |
| `GET /callback` | Where Upwork returns; stores the tokens |
| `GET /status` | `{ connected, expiresAt, connectUrl }` — what the app checks |
| `GET /jobs?q=…&limit=…` | `{ jobs: [...] }` — live search, what Refresh calls |
| `GET /disconnect` | Forgets the tokens |
| `POST /apply` | 501 on purpose — see below |

Everything but `/callback` requires your `UPSCOUT_TOKEN`, as an
`Authorization: Bearer` header or `?key=` on a link.

## If your API application is still pending

Upwork approves API applications by hand and it can take a few days. Until
then, `connector/feed-passthrough-worker.js` one directory up does the CORS
half of the job for a saved-search feed URL, and the app's **Search → Paste
jobs in** needs no setup at all. Both are stop-gaps; this bridge is the one
that makes Refresh work by itself.

## Applying

`/apply` returns 501 deliberately. Upwork publishes no endpoint that submits a
proposal, so anything that submits one is automation you'd be running against
your own account under Upwork's terms — a decision to make in code you've read,
not one to inherit from a template. UpScout's default is the manual send: the
letter is copied and the apply page opens, one tap and one paste.

## Running it somewhere else

The worker is a single default-exported `fetch(request, env)`. Any runtime with
that shape works — Deno Deploy as-is; Node with a small shim — provided `env`
carries the same variables and a KV-like `UPSCOUT` with `get`/`put`/`delete`.
