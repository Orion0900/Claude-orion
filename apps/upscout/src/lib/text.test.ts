import { describe, expect, it } from 'vitest'
import { containsTerm, decodeEntities, matchedTerms, parseTerms, stripHtml, truncate } from './text'

describe('containsTerm', () => {
  it('matches whole words only', () => {
    expect(containsTerm('Senior Java developer', 'java')).toBe(true)
    expect(containsTerm('Senior JavaScript developer', 'java')).toBe(false)
  })

  it('ignores case and punctuation', () => {
    expect(containsTerm('Build a REACT dashboard.', 'react')).toBe(true)
    expect(containsTerm('Skills: React, TypeScript', 'typescript')).toBe(true)
  })

  it('treats the spellings of a tool as the same tool', () => {
    expect(containsTerm('We use Node.js on the backend', 'nodejs')).toBe(true)
    expect(containsTerm('We use nodejs on the backend', 'node.js')).toBe(true)
    expect(containsTerm('We use node js on the backend', 'Node.JS')).toBe(true)
  })

  it('keeps symbols that are part of a language name', () => {
    expect(containsTerm('Looking for a C# developer', 'c#')).toBe(true)
    expect(containsTerm('Looking for a C++ developer', 'c#')).toBe(false)
  })

  it('treats a plural and its singular as the same word', () => {
    expect(containsTerm('Build out a design system', 'design systems')).toBe(true)
    expect(containsTerm('We need dashboards', 'dashboard')).toBe(true)
    expect(containsTerm('Styling in CSS', 'css')).toBe(true)
  })

  it('matches multi-word phrases as phrases', () => {
    expect(containsTerm('needs technical writing help', 'technical writing')).toBe(true)
    expect(containsTerm('technical role, writing optional', 'technical writing')).toBe(false)
  })

  it('is false for empty terms', () => {
    expect(containsTerm('anything', '  ')).toBe(false)
  })
})

describe('matchedTerms', () => {
  it('returns the hits in the order asked for', () => {
    expect(matchedTerms('React, Node.js and Figma', ['figma', 'react', 'rust'])).toEqual(['figma', 'react'])
  })
})

describe('parseTerms', () => {
  it('splits on commas and newlines, trimming and de-duplicating', () => {
    expect(parseTerms('React, react\n TypeScript ,, Figma')).toEqual(['React', 'TypeScript', 'Figma'])
  })

  it('is empty for empty input', () => {
    expect(parseTerms('  ,\n ')).toEqual([])
  })
})

describe('stripHtml', () => {
  it('turns feed HTML into readable text', () => {
    expect(stripHtml('Hello<br /><br />World &amp; friends')).toBe('Hello\n\nWorld & friends')
  })

  it('collapses runs of blank lines', () => {
    expect(stripHtml('a<br /><br /><br /><br />b')).toBe('a\n\nb')
  })
})

describe('decodeEntities', () => {
  it('handles named and numeric entities', () => {
    expect(decodeEntities('caf&eacute; &#8212; &#x2014; &quot;x&quot;')).toBe('caf&eacute; — — "x"')
  })
})

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('short', 20)).toBe('short')
  })

  it('cuts on a word boundary', () => {
    expect(truncate('the quick brown fox jumps', 16)).toBe('the quick brown…')
  })
})
