# PodBrief

Paste a Spotify podcast link. Get every point from the episode, with timestamps,
in a few minutes — on your phone, as an app.

<p>
  <img src="docs/screenshot-home.png" width="260" alt="Home screen" />
  <img src="docs/screenshot-summary.png" width="260" alt="Summary" />
  <img src="docs/screenshot-summary-dark.png" width="260" alt="Summary, dark mode" />
</p>

## What it does

1. **Reads the Spotify link.** Works with share links, `spotify:episode:` URIs
   and `spotify.link` short links. Spotify doesn't hand out podcast audio, so
   the link is only used to learn *which* episode of *which* show this is.
2. **Finds the audio.** Looks the show up in the Apple Podcasts directory
   (keyless), fetches its RSS feed and matches the episode by title, date and
   length. If the lookup fails you're asked for the feed or MP3 URL once.
3. **Gets the words.** If the publisher ships a transcript in the feed
   (Podcasting 2.0), that's used for free. Otherwise the audio goes to
   AssemblyAI (from the URL, no download) or OpenAI Whisper.
4. **Summarizes with Claude.** One structured request over the full
   timestamped transcript produces: a TL;DR, every key point with detail and
   a timestamp, chapters, quotes, action items, and everything mentioned.
   Timestamps deep-link back into Spotify.
5. **Installs on an iPhone.** It's a Progressive Web App: Safari → Share →
   Add to Home Screen. Full screen, its own icon, and finished summaries are
   kept on the device so they open offline.

Jobs run on the server and the phone polls for progress, so you can lock the
screen while a two-hour episode transcribes.

## Running it

You need Node 22 and an Anthropic API key. For transcription, set an
AssemblyAI or OpenAI key too (feeds that publish transcripts work without one).

```bash
cd podcast-summarizer
npm install
cp .env.example .env    # fill in ANTHROPIC_API_KEY and a transcription key
npm run build
set -a; source .env; set +a
npm start               # http://localhost:8787
```

Open that address in Safari on your iPhone (on the same Wi-Fi, use your
computer's IP, e.g. `http://192.168.1.20:8787`) and **Add to Home Screen**.

### Development

```bash
npm run dev     # Vite on :5173 with the API proxied from :8787, both hot-reloading
npm test        # unit and pipeline tests (no network needed)
```

### One-click hosting (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Orion0900/Claude-orion)

The `render.yaml` at the repo root builds the Docker image and asks for your
`ANTHROPIC_API_KEY` and `ASSEMBLYAI_API_KEY`. You get an HTTPS URL to open on
the phone. The free plan sleeps when idle (first request takes ~30 s) and its
disk resets on deploy; summaries you've opened are kept on the phone anyway.

### Docker

```bash
docker build -t podbrief .
docker run -p 8787:8787 --env-file .env -v podbrief-data:/data podbrief
```

The image includes ffmpeg, which the OpenAI path needs to split episodes over
25 MB. Deploy it anywhere that runs a container (Fly.io, Railway, Render, a
Raspberry Pi) and the app is reachable from your phone anywhere, not just at
home. Put it behind HTTPS: iOS only registers the offline service worker on
secure origins (and `localhost`).

### Configuration

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required. Claude writes the summaries. |
| `CLAUDE_MODEL` | Defaults to `claude-opus-5`. |
| `ASSEMBLYAI_API_KEY` | Transcription from the audio URL; no size limit. Recommended. |
| `OPENAI_API_KEY` | Whisper transcription. Downloads the file; needs ffmpeg over 25 MB. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Optional. Uses the Spotify Web API for episode lookup instead of reading the public page. |
| `DATA_DIR` | Where `jobs.json` (finished summaries) lives. Default `./data`. |
| `PORT` | Default `8787`. |

The app can also be hosted separately from the API (e.g. on static hosting):
set the server address under **Settings** in the app. The API allows
cross-origin requests.

## API

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/jobs` | `{ "url": "https://open.spotify.com/episode/…" }` → job (202) |
| `GET` | `/api/jobs/:id` | Job with `stage`, `message`, `episode`, and `summary` when done |
| `POST` | `/api/jobs/:id/source` | `{ "feedUrl" }` or `{ "audioUrl" }` when a job is `needs_source` |
| `GET` | `/api/jobs` | All jobs, without summary bodies |
| `DELETE` | `/api/jobs/:id` | |
| `GET` | `/api/health` | Which providers are configured |

Stages: `queued → resolving → finding_audio → transcribing → summarizing → done`,
with `needs_source` and `failed` as the two stops.

## Layout

```
server/
  index.ts          Express API; serves the built web app in production
  jobs.ts           the pipeline, run as background jobs and persisted to JSON
  lib/
    spotify.ts      URL parsing, episode page/Web API metadata
    feeds.ts        Apple directory search, RSS parsing, episode matching
    transcribe.ts   feed transcripts, AssemblyAI, OpenAI Whisper, rendering
    summarize.ts    Claude structured-output request and the summary schema
    text.ts         title normalization, similarity, durations
web/
  src/              React PWA: paste, progress, summary, history, settings
  public/           manifest, service worker, icons (scripts/make-icons.mjs)
```

## Limits worth knowing

- Spotify-exclusive shows have no public RSS feed, so there's no audio to
  transcribe. The app will ask for a source it can't find.
- Episode lookup without Spotify API credentials reads the public episode
  page, which Spotify can change. Credentials make it robust.
- Transcription is the slow and (with a paid provider) costly part: budget a
  few minutes and a few cents per hour of audio. The Claude call on a two-hour
  transcript is typically well under a dollar.
