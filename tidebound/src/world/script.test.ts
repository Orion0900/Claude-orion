import { fillText, parsePath, reversePath } from './script'

describe('script paths', () => {
  it('reads letters with optional counts', () => {
    expect(parsePath('u2rd')).toEqual(['up', 'up', 'right', 'down'])
    expect(parsePath('l10').length).toBe(10)
  })

  it('walks a path back the way it came', () => {
    expect(reversePath('ul5')).toBe('rrrrrd')
    expect(parsePath(reversePath('u3l2d'))).toEqual(['up', 'right', 'right', 'down', 'down', 'down'])
    expect(reversePath('')).toBe('')
  })

  it('fills in the player and rival names', () => {
    expect(fillText('{PLAYER} met {RIVAL}.', null)).toBe('YOU met SKYE.')
  })
})
