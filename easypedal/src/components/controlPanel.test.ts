import { describe, expect, it } from 'vitest'
import { searchTextStillApplies, shortPlaceName } from './ControlPanel'

describe('shortPlaceName', () => {
  it('keeps the place itself and drops the address behind it', () => {
    expect(shortPlaceName('Harvard Square, Cambridge, Massachusetts')).toBe('Harvard Square')
  })

  it('drops the current-location marker, which names nothing', () => {
    expect(shortPlaceName('Your current location · 24 Beacon Street, Boston')).toBe('24 Beacon Street')
  })

  it('leaves a bare name alone', () => {
    expect(shortPlaceName('Boston Public Library')).toBe('Boston Public Library')
  })

  it('has nothing to say about nothing', () => {
    expect(shortPlaceName(null)).toBeNull()
    expect(shortPlaceName('  ')).toBeNull()
  })
})

describe('searchTextStillApplies', () => {
  const library = { lat: 42.3496, lng: -71.0779 }

  it('keeps the name of the place the pin was set from', () => {
    expect(searchTextStillApplies(library, { ...library })).toBe(true)
  })

  it('lets go once the pin is set somewhere else', () => {
    expect(searchTextStillApplies(library, { lat: 42.36, lng: -71.06 })).toBe(false)
  })

  it('lets go when the end is cleared or was never picked from the box', () => {
    expect(searchTextStillApplies(library, null)).toBe(false)
    expect(searchTextStillApplies(null, library)).toBe(false)
  })
})
