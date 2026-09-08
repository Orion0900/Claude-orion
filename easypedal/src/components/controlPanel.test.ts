import { describe, expect, it } from 'vitest'
import { shortPlaceName } from './ControlPanel'

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
