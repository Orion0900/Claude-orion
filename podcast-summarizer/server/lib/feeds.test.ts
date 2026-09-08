import { describe, expect, it } from 'vitest'
import { matchEpisode, parseFeed, pickFeed } from './feeds.js'

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Huberman Lab</title>
  <itunes:author>Scicomm Media</itunes:author>
  <item>
    <title><![CDATA[Why We Sleep & Dream]]></title>
    <guid isPermaLink="false">ep-100</guid>
    <pubDate>Mon, 04 Mar 2024 09:00:00 +0000</pubDate>
    <itunes:duration>1:30:00</itunes:duration>
    <description><![CDATA[<p>Dr. Walker explains <b>sleep</b>.</p><p>Second para.</p>]]></description>
    <enclosure url="https://cdn.example.com/ep100.mp3" length="1" type="audio/mpeg"/>
    <podcast:transcript url="https://cdn.example.com/ep100.srt" type="application/x-subrip" language="en"/>
    <podcast:transcript url="https://cdn.example.com/ep100.vtt" type="text/vtt"/>
  </item>
  <item>
    <title>Ep. 99: How to Focus</title>
    <pubDate>Mon, 26 Feb 2024 09:00:00 +0000</pubDate>
    <itunes:duration>5400</itunes:duration>
    <enclosure url="https://cdn.example.com/ep99.mp3" type="audio/mpeg"/>
  </item>
</channel></rss>`

describe('parseFeed', () => {
  it('reads items, enclosures, transcripts and durations', () => {
    const parsed = parseFeed(feed)
    expect(parsed.title).toBe('Huberman Lab')
    expect(parsed.author).toBe('Scicomm Media')
    expect(parsed.items).toHaveLength(2)
    const [a, b] = parsed.items
    expect(a.title).toBe('Why We Sleep & Dream')
    expect(a.guid).toBe('ep-100')
    expect(a.audioUrl).toBe('https://cdn.example.com/ep100.mp3')
    expect(a.durationSec).toBe(5400)
    expect(a.description).toBe('Dr. Walker explains sleep.\n\nSecond para.')
    expect(a.transcripts.map((t) => t.type)).toEqual(['application/x-subrip', 'text/vtt'])
    expect(b.durationSec).toBe(5400)
    expect(b.transcripts).toEqual([])
  })
  it('rejects non-feeds', () => {
    expect(() => parseFeed('<html></html>')).toThrow()
  })
})

describe('matchEpisode', () => {
  const items = parseFeed(feed).items
  it('matches on exact title', () => {
    expect(matchEpisode(items, { title: 'Why We Sleep & Dream' })?.guid).toBe('ep-100')
  })
  it('matches when the feed prefixes an episode number', () => {
    expect(matchEpisode(items, { title: 'How to Focus', publishedAt: '2024-02-26' })?.audioUrl).toBe('https://cdn.example.com/ep99.mp3')
  })
  it('returns nothing for an unrelated title', () => {
    expect(matchEpisode(items, { title: 'Completely different topic entirely' })).toBeUndefined()
  })
})

describe('pickFeed', () => {
  const candidates = [
    { name: 'Huberman Lab Clips', publisher: 'Someone', feedUrl: 'https://a' },
    { name: 'Huberman Lab', publisher: 'Scicomm Media', feedUrl: 'https://b' },
    { name: 'Lab Rats', publisher: 'X', feedUrl: 'https://c' },
  ]
  it('prefers the exact show and publisher', () => {
    expect(pickFeed(candidates, 'Huberman Lab', 'Scicomm Media')?.feedUrl).toBe('https://b')
  })
  it('gives up on poor matches', () => {
    expect(pickFeed(candidates, 'Totally Other Podcast')).toBeUndefined()
  })
})
