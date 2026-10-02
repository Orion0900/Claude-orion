import { defaultEdit, formatBytes, formatClock, newProject, projectName } from './project'
import type { CaptionStyle, MediaInfo } from './types'

const media: MediaInfo = {
  fileName: 'IMG_4410.MOV',
  mimeType: 'video/quicktime',
  size: 1,
  duration: 42,
  width: 1080,
  height: 1920,
  frameRate: 30,
  hasAudio: true,
  videoCodec: 'hevc',
  audioCodec: 'aac',
}

describe('new projects', () => {
  it('are named after the file, tidied', () => {
    expect(projectName('IMG_4410.MOV')).toBe('IMG 4410')
    expect(projectName('my-first-vlog.mp4')).toBe('my first vlog')
  })

  it('name a nameless recording after its day', () => {
    expect(projectName('recording.mp4', new Date(2026, 9, 2))).toMatch(/Oct 2 take/)
    expect(projectName('', new Date(2026, 9, 2))).toMatch(/take$/)
  })

  it('start untranscribed, uncut and portrait', () => {
    const p = newProject(media, { preset: 'bold' } as CaptionStyle, null, 1000)
    expect(p.transcript.status).toBe('none')
    expect(p.words).toEqual([])
    expect(p.edit).toEqual(defaultEdit())
    expect(p.format.aspect).toBe('9:16')
    expect(p.createdAt).toBe(1000)
    expect(p.id).toMatch(/^p/)
  })
})

describe('formatting', () => {
  it('shows clock times', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(7.9)).toBe('0:07')
    expect(formatClock(64)).toBe('1:04')
    expect(formatClock(3849)).toBe('1:04:09')
    expect(formatClock(-3)).toBe('0:00')
  })

  it('shows sizes', () => {
    expect(formatBytes(0)).toBe('0 MB')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12.4 MB')
    expect(formatBytes(340 * 1024 * 1024)).toBe('340 MB')
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
  })
})
