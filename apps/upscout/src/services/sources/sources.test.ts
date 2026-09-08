import { describe, expect, it } from 'vitest'
import { EMPTY_CRITERIA } from '../../lib/criteria'
import type { Job } from '../../lib/types'
import { dedupeJobs, dedupeKey, normaliseJob } from './normalise'
import { looksLikeFeed, parseFeed, parseMoneyRange } from './rss'
import { bridgeBase, bridgeLink } from './bridge'
import { mapApiNode } from './upworkApi'
import { parsePasted, withQuery } from './index'

const NOW = new Date('2026-03-10T12:00:00.000Z')

/** Shaped like a real Upwork saved-search feed, including its quirks. */
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Upwork RSS Feed</title>
  <item>
    <title><![CDATA[React dashboard for a logistics tool - Upwork]]></title>
    <link>https://www.upwork.com/jobs/~01abc1234567890</link>
    <guid isPermaLink="false">https://www.upwork.com/jobs/~01abc1234567890</guid>
    <pubDate>Tue, 10 Mar 2026 10:00:00 +0000</pubDate>
    <description><![CDATA[We need an internal dashboard built.<br /><br /><b>Hourly Range</b>: $45.00-$70.00<br /><br /><b>Posted On</b>: March 10, 2026 10:00 UTC<br /><b>Category</b>: Web Development<br /><b>Skills</b>:React, TypeScript, Node.js<br /><b>Country</b>:United States<br /><a href="https://www.upwork.com/jobs/~01abc1234567890">click to apply</a>]]></description>
  </item>
  <item>
    <title><![CDATA[Landing page copy - Upwork]]></title>
    <link>https://www.upwork.com/jobs/~02def1234567890</link>
    <pubDate>Tue, 10 Mar 2026 09:00:00 +0000</pubDate>
    <description><![CDATA[Short punchy copy needed.<br /><b>Budget</b>: $750.00<br /><b>Category</b>: Sales &amp; Marketing<br /><b>Skills</b>:Copywriting<br /><b>Country</b>:Germany]]></description>
  </item>
  <item>
    <link>https://www.upwork.com/jobs/~03nope</link>
  </item>
</channel></rss>`

describe('parseFeed', () => {
  const jobs = parseFeed(FEED, 'feed', NOW)

  it('reads every usable item and skips the one with no title', () => {
    expect(jobs).toHaveLength(2)
  })

  it('takes the " - Upwork" suffix off the title', () => {
    expect(jobs[0].title).toBe('React dashboard for a logistics tool')
  })

  it('pulls the hourly range apart', () => {
    expect(jobs[0].budget).toEqual({ type: 'hourly', min: 45, max: 70, currency: 'USD' })
  })

  it('reads a fixed budget as fixed', () => {
    expect(jobs[1].budget).toEqual({ type: 'fixed', min: 750, max: undefined, currency: 'USD' })
  })

  it('picks up skills, category and country', () => {
    expect(jobs[0].skills).toEqual(['React', 'TypeScript', 'Node.js'])
    expect(jobs[0].category).toBe('Web Development')
    expect(jobs[0].client.country).toBe('United States')
    expect(jobs[1].category).toBe('Sales & Marketing')
  })

  it('keeps the client description and leaves the metadata lines out of it', () => {
    expect(jobs[0].description).toBe('We need an internal dashboard built.')
  })

  it('uses the posted time from the feed', () => {
    expect(jobs[0].postedAt).toBe('2026-03-10T10:00:00.000Z')
  })

  it('returns nothing for an empty or broken document instead of throwing', () => {
    expect(parseFeed('', 'feed', NOW)).toEqual([])
    expect(parseFeed('<rss><channel><item><title>Half a', 'feed', NOW)).toEqual([])
  })
})

describe('parseMoneyRange', () => {
  it('reads ranges, single values and nothing at all', () => {
    expect(parseMoneyRange('$45.00-$70.00')).toEqual({ min: 45, max: 70 })
    expect(parseMoneyRange('$1,250.00')).toEqual({ min: 1250 })
    expect(parseMoneyRange('Not specified')).toEqual({})
  })
})

describe('looksLikeFeed', () => {
  it('tells XML from JSON', () => {
    expect(looksLikeFeed('<?xml version="1.0"?><rss>')).toBe(true)
    expect(looksLikeFeed('  {"jobs": []}')).toBe(false)
  })
})

describe('normaliseJob', () => {
  it('needs a title and nothing else', () => {
    expect(normaliseJob({ url: 'https://x' }, 'bridge', NOW)).toBeUndefined()
    expect(normaliseJob({ title: 'Something' }, 'bridge', NOW)?.title).toBe('Something')
  })

  it('coerces the shapes a bridge might send', () => {
    const job = normaliseJob(
      {
        title: 'Build an API',
        link: 'https://www.upwork.com/jobs/~01xyz',
        hourlyMin: '55',
        hourlyMax: 80,
        skills: [{ name: 'Node.js' }, 'Postgres'],
        published: 1_772_000_000,
        client: { totalHires: 8, jobsPosted: 10, verified: true },
      },
      'bridge',
      NOW,
    )!
    expect(job.budget).toMatchObject({ type: 'hourly', min: 55, max: 80 })
    expect(job.skills).toEqual(['Node.js', 'Postgres'])
    expect(job.client.hireRate).toBeCloseTo(0.8)
    expect(job.postedAt.startsWith('2026-')).toBe(true)
  })

  it('falls back to the link as an id, and to now as the posting time', () => {
    const job = normaliseJob({ title: 'X', link: 'https://www.upwork.com/jobs/~01aaa' }, 'bridge', NOW)!
    expect(job.id).toBe('https://www.upwork.com/jobs/~01aaa')
    expect(job.postedAt).toBe(NOW.toISOString())
  })
})

describe('dedupeJobs', () => {
  const base = (overrides: Partial<Job>): Job => ({
    ...normaliseJob({ title: 'React dashboard' }, 'a', NOW)!,
    ...overrides,
  })

  it('treats the same posting from two sources as one job', () => {
    const feed = base({ id: 'guid-1', url: 'https://www.upwork.com/jobs/~01abc1234567890', source: 'feed' })
    const api = base({ id: '~01abc1234567890', url: 'https://www.upwork.com/jobs/~01abc1234567890', source: 'api' })
    expect(dedupeJobs([feed, api])).toHaveLength(1)
  })

  it('keeps the copy that knows more, with the earlier first-seen time', () => {
    const thin = base({ url: 'https://www.upwork.com/jobs/~01abc1234567890', fetchedAt: '2026-03-09T00:00:00.000Z' })
    const rich = base({
      url: 'https://www.upwork.com/jobs/~01abc1234567890',
      skills: ['React'],
      proposals: 4,
      description: 'Lots of detail',
      fetchedAt: NOW.toISOString(),
    })
    const [merged] = dedupeJobs([thin, rich])
    expect(merged.proposals).toBe(4)
    expect(merged.fetchedAt).toBe('2026-03-09T00:00:00.000Z')
  })

  it('keeps genuinely different jobs apart', () => {
    expect(dedupeJobs([base({ id: 'a', title: 'A' }), base({ id: 'b', title: 'B' })])).toHaveLength(2)
  })

  it('falls back to title and country when there is no Upwork id', () => {
    expect(dedupeKey(base({ id: 'x', url: '', client: { country: 'Germany' } }))).toBe('react dashboard|germany')
  })
})

describe('mapApiNode', () => {
  it('maps a GraphQL node, building the job URL from the ciphertext', () => {
    const job = mapApiNode(
      {
        id: '1',
        ciphertext: '~01feed1234567890',
        title: 'Node API work',
        description: 'Build endpoints',
        createdDateTime: '2026-03-10T09:00:00Z',
        totalApplicants: 6,
        hourlyBudgetMin: { rawValue: '50' },
        hourlyBudgetMax: { rawValue: '75' },
        skills: [{ name: 'Node.js' }],
        client: {
          totalHires: 20,
          totalPostedJobs: 25,
          totalSpent: { rawValue: '120000' },
          totalFeedback: 4.85,
          verificationStatus: 'VERIFIED',
          location: { country: 'Canada' },
        },
      },
      'api',
      NOW,
    )!
    expect(job.url).toBe('https://www.upwork.com/jobs/~01feed1234567890')
    expect(job.budget).toMatchObject({ type: 'hourly', min: 50, max: 75 })
    expect(job.proposals).toBe(6)
    expect(job.client).toMatchObject({ paymentVerified: true, rating: 4.85, totalSpend: 120_000, country: 'Canada' })
  })

  it('handles a fixed-price node with fields missing', () => {
    const job = mapApiNode({ title: 'Logo', amount: { rawValue: '300', currency: 'EUR' } }, 'api', NOW)!
    expect(job.budget).toMatchObject({ type: 'fixed', min: 300, currency: 'EUR' })
    expect(job.client.rating).toBeUndefined()
  })
})

describe('parsePasted', () => {
  it('accepts a feed document', () => {
    expect(parsePasted(FEED, 'manual', NOW)).toHaveLength(2)
  })

  it('accepts a JSON array and a jobs envelope', () => {
    expect(parsePasted('[{"title":"A"}]', 'manual', NOW)).toHaveLength(1)
    expect(parsePasted('{"jobs":[{"title":"A"},{"title":"B"}]}', 'manual', NOW)).toHaveLength(2)
  })

  it('is empty for empty input and explains itself for anything else', () => {
    expect(parsePasted('   ')).toEqual([])
    expect(() => parsePasted('just some words')).toThrow(/feed or JSON/)
    expect(() => parsePasted('{"nope":1}')).toThrow(/array of jobs/)
  })
})

describe('withQuery', () => {
  it('adds the search terms without losing the bridge’s own parameters', () => {
    const url = withQuery('https://bridge.example.com/jobs?key=abc', {
      ...EMPTY_CRITERIA,
      query: 'react dashboard',
      requiredSkills: ['React'],
      maxPostedHoursAgo: 24,
    })
    expect(url).toContain('key=abc')
    expect(url).toContain('q=react+dashboard')
    expect(url).toContain('skills=React')
    expect(url).toContain('hours=24')
  })

  it('leaves a URL it cannot parse alone', () => {
    expect(withQuery('not a url', EMPTY_CRITERIA)).toBe('not a url')
  })
})

describe('bridgeBase', () => {
  it('accepts every shape of the same URL', () => {
    for (const written of [
      'https://b.workers.dev',
      'https://b.workers.dev/',
      'https://b.workers.dev/jobs',
      '  https://b.workers.dev/status  ',
      'https://b.workers.dev/connect',
    ]) {
      expect(bridgeBase(written)).toBe('https://b.workers.dev')
    }
  })

  it('leaves a path that isn’t one of the bridge’s own routes', () => {
    expect(bridgeBase('https://b.workers.dev/upwork/')).toBe('https://b.workers.dev/upwork')
  })
})

describe('bridgeLink', () => {
  it('carries the secret on a link, since a redirect cannot carry a header', () => {
    expect(bridgeLink('https://b.workers.dev/jobs', '/connect', 'hunter2')).toBe(
      'https://b.workers.dev/connect?key=hunter2',
    )
    expect(bridgeLink('https://b.workers.dev', '')).toBe('https://b.workers.dev')
  })
})
