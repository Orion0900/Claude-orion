import 'fake-indexeddb/auto'
import { defaultEdit, defaultFormat, defaultHook, normalizeProject } from '../lib/project'
import type { CaptionStyle, Project } from '../lib/types'
import {
  deleteProject,
  dropConnectionForTests,
  getAnalysis,
  getBlob,
  getProject,
  listProjects,
  packAnalysis,
  putFile,
  saveProject,
  unpackAnalysis,
} from './db'

const style = { preset: 'bold', font: 'montserrat', weight: 900, size: 0.07 } as unknown as CaptionStyle

function project(id: string): Project {
  return {
    id,
    name: 'Test',
    createdAt: 1,
    updatedAt: 2,
    media: {
      fileName: 'a.mov',
      mimeType: 'video/quicktime',
      size: 10,
      duration: 12.5,
      width: 1080,
      height: 1920,
      frameRate: 30,
      hasAudio: true,
      videoCodec: 'hevc',
      audioCodec: 'aac',
    },
    transcript: { status: 'done', language: 'en', model: 'base' },
    words: [{ id: 'w1', text: 'Hello', start: 0.2, end: 0.6, emphasis: true }],
    edit: defaultEdit(),
    style,
    format: defaultFormat(),
    hook: defaultHook(),
    translation: null,
    music: null,
    thumbnail: null,
  }
}

describe('project storage', () => {
  it('saves, lists, reads back and deletes a project with its files', async () => {
    await saveProject(project('p1'))
    await saveProject(project('p2'))
    await putFile('p1', 'source', new Blob(['video bytes'], { type: 'video/mp4' }))
    await putFile('p1', 'analysis', packAnalysis({ envelope: new Float32Array([0.1, 0.5, 0.25]), frameDuration: 0.01 }))

    expect((await listProjects()).length).toBe(2)
    const loaded = normalizeProject(await getProject('p1'), style)
    expect(loaded?.words[0]).toEqual({ id: 'w1', text: 'Hello', start: 0.2, end: 0.6, emphasis: true })

    const blob = await getBlob('p1', 'source')
    expect(blob?.size).toBe(11)
    const analysis = await getAnalysis('p1')
    expect(Array.from(analysis!.envelope)).toEqual([0.10000000149011612, 0.5, 0.25])

    await deleteProject('p1')
    expect(await getProject('p1')).toBeUndefined()
    expect(await getBlob('p1', 'source')).toBeNull()
    expect(await getAnalysis('p1')).toBeNull()
    expect((await listProjects()).length).toBe(1)
  })
})

describe('a connection the browser closed', () => {
  it('is reopened, so saving keeps working after the app was backgrounded', async () => {
    await saveProject(project('q1'))
    await dropConnectionForTests()
    await saveProject(project('q2'))
    expect(normalizeProject(await getProject('q2'), style)?.id).toBe('q2')
  })
})

describe('reading stored projects defensively', () => {
  it('rejects things that are not projects', () => {
    expect(normalizeProject(null, style)).toBeNull()
    expect(normalizeProject({ id: 3 }, style)).toBeNull()
    expect(normalizeProject({ id: 'x' }, style)).toBeNull()
  })

  it('fills in anything missing and drops broken words', () => {
    const p = normalizeProject(
      {
        id: 'x',
        media: { duration: 4 },
        words: [{ id: 'a', text: 'ok', start: 1, end: 2 }, { id: 'b', text: 'bad' }, 'junk'],
        transcript: { status: 'running' },
        format: { aspect: '3:2', zoom: 99 },
      },
      style,
    )!
    expect(p.words.map((w) => w.id)).toEqual(['a'])
    expect(p.transcript.status).toBe('none')
    expect(p.format.aspect).toBe('9:16')
    expect(p.format.zoom).toBe(4)
    expect(p.edit).toEqual(defaultEdit())
    expect(p.style).toEqual(style)
  })

  it('ignores a malformed analysis', () => {
    expect(unpackAnalysis({ envelope: [1, 2], frameDuration: 0.01 })).toBeNull()
    expect(unpackAnalysis(null)).toBeNull()
  })
})
