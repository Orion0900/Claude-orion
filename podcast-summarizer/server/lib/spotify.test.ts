import { describe, expect, it } from 'vitest'
import { metaContent, parseEpisodePage, parseIsoDuration, parseSpotifyUrl } from './spotify.js'

describe('parseSpotifyUrl', () => {
  const id = '4rOoJ6Egrf8K2IrywzwOMk'
  it('reads share links with tracking noise', () => {
    expect(parseSpotifyUrl(`https://open.spotify.com/episode/${id}?si=abc123&nd=1`)).toEqual({ kind: 'episode', id })
  })
  it('reads localized and embed paths', () => {
    expect(parseSpotifyUrl(`https://open.spotify.com/intl-de/episode/${id}`)).toEqual({ kind: 'episode', id })
    expect(parseSpotifyUrl(`https://open.spotify.com/embed/episode/${id}`)).toEqual({ kind: 'episode', id })
  })
  it('reads URIs and show links', () => {
    expect(parseSpotifyUrl(`spotify:episode:${id}`)).toEqual({ kind: 'episode', id })
    expect(parseSpotifyUrl(`open.spotify.com/show/${id}`)).toEqual({ kind: 'show', id })
  })
  it('rejects other sites and tracks', () => {
    expect(parseSpotifyUrl('https://example.com/episode/4rOoJ6Egrf8K2IrywzwOMk')).toBeNull()
    expect(parseSpotifyUrl(`https://open.spotify.com/track/${id}`)).toBeNull()
    expect(parseSpotifyUrl('not a url')).toBeNull()
  })
})

describe('parseEpisodePage', () => {
  const html = `<!doctype html><html><head>
    <title>Why We Sleep &amp; Dream - Huberman Lab | Podcast on Spotify</title>
    <meta property="og:title" content="Why We Sleep &amp; Dream"/>
    <meta property="og:description" content="Dr. Walker explains &lt;b&gt;sleep&lt;/b&gt; stages."/>
    <meta property="og:image" content="https://i.scdn.co/image/abc"/>
    <meta name="music:duration" content="5400"/>
    <meta name="music:release_date" content="2024-03-04"/>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"PodcastEpisode","name":"Why We Sleep & Dream","datePublished":"2024-03-04","timeRequired":"PT1H30M","partOfSeries":{"@type":"PodcastSeries","name":"Huberman Lab","publisher":{"@type":"Organization","name":"Scicomm Media"}}}</script>
    </head><body></body></html>`

  it('combines og tags, title tag and JSON-LD', () => {
    const meta = parseEpisodePage(html, 'abc')
    expect(meta.title).toBe('Why We Sleep & Dream')
    expect(meta.showName).toBe('Huberman Lab')
    expect(meta.publisher).toBe('Scicomm Media')
    expect(meta.description).toBe('Dr. Walker explains sleep stages.')
    expect(meta.durationMs).toBe(90 * 60 * 1000)
    expect(meta.publishedAt).toBe('2024-03-04')
    expect(meta.imageUrl).toBe('https://i.scdn.co/image/abc')
  })

  it('falls back to the title tag alone', () => {
    const meta = parseEpisodePage('<title>Ep 12: Chaos - The Show | Podcast on Spotify</title>', 'x')
    expect(meta.title).toBe('Ep 12: Chaos')
    expect(meta.showName).toBe('The Show')
  })

  it('reads the embed page Next.js blob', () => {
    const next = { props: { pageProps: { state: { data: { entity: { type: 'episode', name: 'Embedded Ep', subtitle: 'Embedded Show', duration: 1234000, releaseDate: { isoString: '2024-01-01T00:00:00Z' } } } } } } }
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>`
    const meta = parseEpisodePage(html, 'x')
    expect(meta.title).toBe('Embedded Ep')
    expect(meta.showName).toBe('Embedded Show')
    expect(meta.durationMs).toBe(1234000)
    expect(meta.publishedAt).toBe('2024-01-01T00:00:00Z')
  })

  it('metaContent tolerates attribute order and quotes', () => {
    expect(metaContent(`<meta content='X &amp; Y' property="og:title">`, 'og:title')).toBe('X & Y')
    expect(metaContent('<meta property="og:other" content="z">', 'og:title')).toBeUndefined()
  })

  it('parses ISO durations', () => {
    expect(parseIsoDuration('PT1H2M5S')).toBe(3725000)
    expect(parseIsoDuration('PT45M')).toBe(2700000)
    expect(parseIsoDuration('nope')).toBeUndefined()
  })
})
