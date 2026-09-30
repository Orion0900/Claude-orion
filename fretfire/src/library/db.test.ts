import 'fake-indexeddb/auto'
import { emptyMeta } from '../chart/types'
import { deleteSong, listSongs, loadSong, requestPersistence, saveSong } from './db'
import type { SongPackage } from './importer'

const UNAVAILABLE = 'Song storage is unavailable in this browser mode'

const song = (id: string, addedAt: number, name = id): SongPackage => ({
  id,
  meta: { ...emptyMeta(), name, artist: 'Band', intensity: { guitar: 3, bass: -1 } },
  chartFile: 'notes.chart',
  files: { 'notes.chart': new Blob(['[Song]']), 'song.ogg': new Blob(['OggS audio']) },
  source: `${id}.zip`,
  addedAt,
})

describe('song storage', () => {
  beforeEach(async () => {
    for (const stored of await listSongs()) await deleteSong(stored.id)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('saves, lists, loads and deletes songs', async () => {
    await saveSong(song('b', 2))
    await saveSong(song('a', 1))
    const listed = await listSongs()
    expect(listed.map((s) => s.id)).toEqual(['a', 'b'])
    expect(listed[0]).toEqual({
      id: 'a',
      meta: song('a', 1).meta,
      chartFile: 'notes.chart',
      fileNames: ['notes.chart', 'song.ogg'],
      addedAt: 1,
    })

    const loaded = (await loadSong('a'))!
    expect(loaded.source).toBe('a.zip')
    expect(loaded.meta.intensity).toEqual({ guitar: 3, bass: -1 })
    expect(await loaded.files['song.ogg'].text()).toBe('OggS audio')
    expect(await loaded.files['notes.chart'].text()).toBe('[Song]')

    await deleteSong('a')
    expect(await loadSong('a')).toBeUndefined()
    expect((await listSongs()).map((s) => s.id)).toEqual(['b'])
  })

  it('replaces a song saved again under the same id', async () => {
    await saveSong(song('a', 1, 'Old'))
    await saveSong({ ...song('a', 5, 'New'), files: { 'notes.mid': new Blob(['MThd']), 'song.opus': new Blob(['x']) } })
    const listed = await listSongs()
    expect(listed).toHaveLength(1)
    expect(listed[0].meta.name).toBe('New')
    expect(listed[0].fileNames).toEqual(['notes.mid', 'song.opus'])
    expect(Object.keys((await loadSong('a'))!.files)).toEqual(['notes.mid', 'song.opus'])
  })

  it('lists songs without reading the file store', async () => {
    await saveSong(song('a', 1))
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction')
    await listSongs()
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0][0]).toEqual(['summaries'])
  })

  it('treats unknown ids as missing', async () => {
    expect(await loadSong('nope')).toBeUndefined()
    await expect(deleteSong('nope')).resolves.toBeUndefined()
  })

  it('reopens the database when the browser has closed the connection', async () => {
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('The database connection is closing.', 'InvalidStateError')
    })
    await saveSong(song('a', 1))
    expect((await listSongs()).map((s) => s.id)).toEqual(['a'])
  })

  it('explains a full disk', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    await expect(saveSong(song('a', 1))).rejects.toThrow('Not enough storage space to save this song')
    vi.restoreAllMocks()
    expect(await listSongs()).toEqual([])
  })

  it('asks for persistent storage when the browser supports it', async () => {
    expect(await requestPersistence()).toBe(false)
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persist, persisted: async () => false } })
    expect(await requestPersistence()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
    vi.stubGlobal('navigator', { storage: { persist: async () => Promise.reject(new Error('no')) } })
    expect(await requestPersistence()).toBe(false)
  })
})

describe('song storage without IndexedDB', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rejects when IndexedDB is missing', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const db = await import('./db')
    await expect(db.listSongs()).rejects.toThrow(UNAVAILABLE)
    await expect(db.saveSong(song('a', 1))).rejects.toThrow(UNAVAILABLE)
    await expect(db.loadSong('a')).rejects.toThrow(UNAVAILABLE)
    await expect(db.deleteSong('a')).rejects.toThrow(UNAVAILABLE)
  })

  it('rejects when opening throws or fails', async () => {
    vi.stubGlobal('indexedDB', {
      open() {
        throw new DOMException('denied', 'SecurityError')
      },
    })
    await expect((await import('./db')).listSongs()).rejects.toThrow(UNAVAILABLE)

    vi.resetModules()
    vi.stubGlobal('indexedDB', {
      open() {
        const request: { onerror?: (event: { preventDefault(): void }) => void } = {}
        setTimeout(() => request.onerror?.({ preventDefault() {} }), 0)
        return request
      },
    })
    await expect((await import('./db')).listSongs()).rejects.toThrow(UNAVAILABLE)
  })

  it('rejects instead of hanging when opening never finishes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('indexedDB', { open: () => ({}) })
    const db = await import('./db')
    const result = expect(db.listSongs()).rejects.toThrow(UNAVAILABLE)
    await vi.advanceTimersByTimeAsync(11_000)
    await result
  })
})
