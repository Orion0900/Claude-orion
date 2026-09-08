import { describe, expect, it } from 'vitest'
import { summaryToMarkdown, timestampToSeconds } from './markdown'

describe('markdown export', () => {
  it('renders every section that has content', () => {
    const md = summaryToMarkdown({
      id: '1', input: '', createdAt: '', updatedAt: '', stage: 'done', message: '',
      episode: { spotifyId: 'x', title: 'Ep', description: '', showName: 'Show', spotifyUrl: 'https://open.spotify.com/episode/x' },
      summary: {
        tldr: 'Short.',
        key_points: [{ point: 'A', detail: 'B', timestamp: '1:00' }],
        chapters: [{ title: 'Intro', start: '0:00', summary: 'Hi' }],
        quotes: [{ text: 'Q', speaker: 'Host', timestamp: '2:00' }],
        action_items: ['Do it'],
        mentions: ['Book'],
        people: ['Host'],
      },
    })
    expect(md).toContain('# Ep')
    expect(md).toContain('- **A** (1:00) — B')
    expect(md).toContain('- [ ] Do it')
    expect(md).toContain('> “Q” — Host (2:00)')
  })
  it('parses timestamps', () => {
    expect(timestampToSeconds('1:02:05')).toBe(3725)
    expect(timestampToSeconds('5:30')).toBe(330)
    expect(timestampToSeconds('nope')).toBeUndefined()
  })
})
