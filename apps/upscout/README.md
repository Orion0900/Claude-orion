# UpScout

Tell it what work you want. It pulls Upwork postings that match, puts the ones
worth your time at the top with the reasoning shown, drafts the proposal from
your own template, and — if you switch it on — queues the applications for you
to release.

> "React or TypeScript, $60/hr or better, posted in the last day, fewer than
> fifteen bids, payment-verified clients."

Runs in the browser on a laptop and installs to the home screen on an iPhone.
No account, no server: everything stays on the device.

![UpScout](docs/screenshot.png)

## What it does

- **Ranks, doesn't just filter.** Every job gets a score out of 100 from pay
  against *your* target, skill overlap, how many have already bid, how good the
  client is, how fresh the post is and how much it sounds like your kind of
  work. Criteria are a separate, hard yes/no — so a rule never hides behind a
  low score, and a preference never quietly deletes a job.
- **Shows its working.** Every score opens into the six factors that made it,
  each with a bar and a sentence. "Ranked third because forty people have
  already bid" is a thing you can act on; a mystery number isn't.
- **Never guesses.** A post that doesn't state the client's rating is marked
  unknown, not bad — otherwise the sources that tell you less would sink to the
  bottom regardless of the work.
- **Weights you can move.** If you want the best-paid work rather than the work
  you're most likely to win, drag Pay up and Competition down. The order
  changes as you drag.
- **Writes the proposal.** Your template, filled in from the post and your
  profile: `{{job.title}}`, `{{match.topSkill}}`, `{{client.country}}`, with
  `{{#…}}` sections for lines that should only appear when there's something to
  put in them. Several templates, each with its own keywords, and the one that
  fits the job is picked automatically. Nothing is invented — every value comes
  from the post or from you.
- **Applies, on a leash.** Auto-apply has a score floor, a daily cap, a
  connects budget, a bid ceiling, and approval on by default. It shows you the
  exact list it would send before it sends anything, and the same function
  produces the preview and the run, so the preview can be trusted. A job on
  your avoid list is never sent, whatever it scores, and a letter with a gap in
  it waits for you rather than going out half-written.
- **Tells you when it declined.** Every job it passed over says why: under your
  score, too many bids, already applied, out of connects.
- **Works with nothing set up.** Paste a search or a feed in and everything
  works. Sources are for when you want it to fetch by itself.
- **Offline.** Jobs, letters, queue and history are on the device, so the app
  opens and stays useful in a tunnel.
- **Moves between devices.** Copy your settings on the laptop, paste them on
  the phone. Tokens stay on the device they were typed on.

## Running it

```bash
cd apps/upscout
npm install
npm run dev      # http://localhost:5173
npm test         # 100 unit tests over the ranking, filters, letters and limits
npm run build
```

## Getting jobs in

The quickest start: **Search → Paste jobs in**, and paste your Upwork search
page source or saved-search feed. Works immediately, works on a phone, works
offline.

For automatic fetching you need a small bridge you run yourself — a browser
page is not allowed to fetch from `upwork.com`, which is a rule of the web
rather than something this app can code around. There's a complete one
(about forty lines, Cloudflare Workers) in [`connector/worker.js`](connector/worker.js),
and the setup, the JSON contract and the Upwork API route are in
[`docs/connector.md`](docs/connector.md).

## Sending

Upwork has no public endpoint for submitting a proposal, so by default sending
is one tap and one paste: the letter goes to your clipboard, the apply page
opens, you set your terms and submit. The queue keeps track of what's
outstanding. If you run a bridge that can submit, point **You → Sending** at it
and the queue posts to it instead — and an application is only ever marked sent
when something confirmed it.

Automating submissions is a decision about your own account and Upwork's terms
of service. The app is built so that finding, ranking and drafting are entirely
yours either way.

## How it's put together

```
src/lib/          the parts that decide things, all pure and all tested
  scoring.ts      six weighted factors → a score, a tier and the reasoning
  criteria.ts     the hard filter, and why each job was dropped
  template.ts     the little {{placeholder}} language and letter drafting
  autoApply.ts    the plan: what would be sent, what wouldn't, and why
  store.ts        device storage, defensive about anything read back
  text.ts         word matching that survives "Node.js" vs "nodejs"
src/services/     talking to the outside world
  sources/        RSS, JSON bridges, the Upwork API, pasted text → one shape
  submit.ts       manual and bridge sending
src/components/   the screens
connector/        a bridge you can deploy
```

The rule the layout follows: anything that makes a decision is a pure function
under `lib/`, so it can be tested without a browser. Components hold no
judgement, only state and layout.
