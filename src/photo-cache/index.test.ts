import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoCache } from './index.js'

async function writeTestPng(
  filePath: string,
  width: number,
  height: number
): Promise<void> {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 100, b: 100 },
    },
  })
    .png()
    .toFile(filePath)
}

describe('PhotoCache', () => {
  let photosDir: string
  let cacheDir: string

  beforeEach(async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-cache-'))
    photosDir = path.join(base, 'photos')
    cacheDir = path.join(base, 'cache')
    await fs.mkdir(photosDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(path.dirname(photosDir), { recursive: true, force: true })
  })

  it('processes every image found under photosDir on init', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    await writeTestPng(path.join(photosDir, 'b.png'), 200, 200)

    const cache = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    await cache.init()

    expect(cache.isReady()).toBe(true)
    expect(cache.getCount()).toBe(2)

    const entries = cache.getCachedEntries()
    expect(entries).toHaveLength(2)
    for (const entry of entries) {
      const stat = await fs.stat(path.join(cacheDir, entry.cacheFileName))
      expect(stat.isFile()).toBe(true)
      expect(entry.width).toBeGreaterThan(0)
      expect(entry.height).toBeGreaterThan(0)
    }

    const aEntry = entries.find((e) => e.relPath === 'a.png')
    expect(aEntry).toMatchObject({ width: 400, height: 300 })
  })

  it('skips unchanged files and reprocesses changed ones on a second init', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    await writeTestPng(path.join(photosDir, 'b.png'), 200, 200)

    const cache = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    await cache.init()
    const firstEntries = cache.getCachedEntries()
    const bEntryBefore = firstEntries.find((e) => e.relPath === 'b.png')

    // change b.png so it gets a new file size and mtime
    await writeTestPng(path.join(photosDir, 'b.png'), 500, 500)

    const cache2 = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    await cache2.init()

    expect(cache2.getCount()).toBe(2)
    const bEntryAfter = cache2
      .getCachedEntries()
      .find((e) => e.relPath === 'b.png')
    expect(bEntryAfter).toBeDefined()
    expect(bEntryAfter?.cacheFileName).toBe(bEntryBefore?.cacheFileName)
  })

  it('removes cache entries and files for photos that no longer exist', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    await writeTestPng(path.join(photosDir, 'b.png'), 200, 200)

    const cache = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    await cache.init()
    const bEntry = cache.getCachedEntries().find((e) => e.relPath === 'b.png')
    const bCachePath = path.join(cacheDir, bEntry?.cacheFileName ?? '')

    await fs.rm(path.join(photosDir, 'b.png'))

    const cache2 = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    await cache2.init()

    expect(cache2.getCount()).toBe(1)
    expect(
      cache2.getCachedEntries().find((e) => e.relPath === 'b.png')
    ).toBeUndefined()
    await expect(fs.stat(bCachePath)).rejects.toThrow()
  })

  it('starts fresh instead of crashing when manifest.json is corrupted', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(path.join(cacheDir, 'manifest.json'), 'not valid json')

    const cache = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    await cache.init()

    expect(cache.isReady()).toBe(true)
    expect(cache.getCount()).toBe(1)
  })

  it('starts fresh instead of crashing when manifest.json has an unexpected shape', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(
      path.join(cacheDir, 'manifest.json'),
      JSON.stringify({ 'a.png': { unexpected: 'shape' } })
    )

    const cache = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    await cache.init()

    expect(cache.isReady()).toBe(true)
    expect(cache.getCount()).toBe(1)
  })

  it('reports zero photos and stays ready when photosDir is empty', async () => {
    const cache = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    await cache.init()

    expect(cache.isReady()).toBe(true)
    expect(cache.getCount()).toBe(0)
    expect(cache.getCachedEntries()).toEqual([])
  })

  describe('when a cache file is removed externally', () => {
    interface CacheFileRemovedHandler {
      handleCacheFileRemoved(filePath: string): Promise<void>
    }

    const invoke = (cache: PhotoCache, filePath: string): Promise<void> =>
      (cache as unknown as CacheFileRemovedHandler).handleCacheFileRemoved(
        filePath
      )

    async function initCacheWithPhoto(): Promise<{
      cache: PhotoCache
      cachePath: string
      cacheFileName: string
    }> {
      await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
      const cache = new PhotoCache({
        photosDir,
        cacheDir,
        maxEdgePx: 2048,
        jpegQuality: 82,
      })
      await cache.init()
      const [entry] = cache.getCachedEntries()
      return {
        cache,
        cachePath: path.join(cacheDir, entry.cacheFileName),
        cacheFileName: entry.cacheFileName,
      }
    }

    it('regenerates the cache file when the source photo still exists', async () => {
      const { cache, cachePath, cacheFileName } = await initCacheWithPhoto()
      await fs.rm(cachePath)

      await invoke(cache, cachePath)

      const regeneratedStat = await fs.stat(cachePath)
      expect(regeneratedStat.isFile()).toBe(true)
      expect(cache.getCount()).toBe(1)
      expect(cache.getCachedEntries()).toEqual([
        {
          relPath: 'a.png',
          cacheFileName,
          format: 'jpeg',
          width: 400,
          height: 300,
        },
      ])
    })

    it('drops the manifest entry when the source photo is also gone', async () => {
      const { cache, cachePath } = await initCacheWithPhoto()
      await fs.rm(cachePath)
      await fs.rm(path.join(photosDir, 'a.png'))

      await invoke(cache, cachePath)

      expect(cache.getCount()).toBe(0)
      expect(cache.getCachedEntries()).toEqual([])
    })

    it('ignores cache files that are not in the manifest', async () => {
      const { cache } = await initCacheWithPhoto()

      await invoke(cache, path.join(cacheDir, 'unknown.jpg'))

      expect(cache.getCount()).toBe(1)
      await expect(
        fs.stat(path.join(cacheDir, 'unknown.jpg'))
      ).rejects.toThrow()
    })

    it('ignores a stale event when the cache file exists again', async () => {
      const { cache, cachePath } = await initCacheWithPhoto()
      const entriesBefore = cache.getCachedEntries()
      const manifestBefore = await fs.readFile(
        path.join(cacheDir, 'manifest.json'),
        'utf8'
      )
      const statBefore = await fs.stat(cachePath)

      await invoke(cache, cachePath)

      expect(cache.getCachedEntries()).toEqual(entriesBefore)
      const statAfter = await fs.stat(cachePath)
      expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs)
      expect(
        await fs.readFile(path.join(cacheDir, 'manifest.json'), 'utf8')
      ).toBe(manifestBefore)
    })

    it('drops the manifest entry without throwing when regeneration fails', async () => {
      const { cache, cachePath } = await initCacheWithPhoto()
      await fs.rm(cachePath)
      await fs.writeFile(path.join(photosDir, 'a.png'), 'not an image')

      await expect(invoke(cache, cachePath)).resolves.toBeUndefined()

      expect(cache.getCount()).toBe(0)
      expect(cache.getCachedEntries()).toEqual([])
    })
  })
})

describe('PhotoCache periodic rescan', () => {
  let photosDir: string
  let cacheDir: string
  const caches: PhotoCache[] = []

  beforeEach(async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-rescan-'))
    photosDir = path.join(base, 'photos')
    cacheDir = path.join(base, 'cache')
    await fs.mkdir(photosDir, { recursive: true })
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    const toClose = [...caches]
    caches.length = 0
    await Promise.all(toClose.map((cache) => cache.close()))
    await fs.rm(path.dirname(photosDir), { recursive: true, force: true })
  })

  function createCache(rescanIntervalMs?: number): PhotoCache {
    const cache = new PhotoCache({
      photosDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
      rescanIntervalMs,
    })
    caches.push(cache)
    return cache
  }

  async function readManifest(): Promise<Record<string, unknown>> {
    return JSON.parse(
      await fs.readFile(path.join(cacheDir, 'manifest.json'), 'utf8')
    ) as Record<string, unknown>
  }

  it('picks up an added photo without any watcher event', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    const cache = createCache()
    await cache.init()

    await writeTestPng(path.join(photosDir, 'b.png'), 200, 100)
    await cache.rescan()

    expect(cache.getCount()).toBe(2)
    const added = cache.getCachedEntries().find((e) => e.relPath === 'b.png')
    expect(added).toMatchObject({ width: 200, height: 100 })
    const stat = await fs.stat(path.join(cacheDir, added?.cacheFileName ?? ''))
    expect(stat.isFile()).toBe(true)
    expect(
      Object.keys(await readManifest()).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['a.png', 'b.png'])
  })

  it('regenerates a changed photo and drops a removed photo', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    await writeTestPng(path.join(photosDir, 'b.png'), 200, 200)
    const cache = createCache()
    await cache.init()
    const removed = cache.getCachedEntries().find((e) => e.relPath === 'b.png')

    await writeTestPng(path.join(photosDir, 'a.png'), 800, 600)
    await fs.rm(path.join(photosDir, 'b.png'))
    await cache.rescan()

    expect(cache.getCachedEntries()).toEqual([
      expect.objectContaining({ relPath: 'a.png', width: 800, height: 600 }),
    ])
    await expect(
      fs.stat(path.join(cacheDir, removed?.cacheFileName ?? ''))
    ).rejects.toThrow()
  })

  it('does not write anything when nothing changed', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    const cache = createCache()
    await cache.init()
    const entry = cache.getCachedEntries()[0]
    const cacheStatBefore = await fs.stat(
      path.join(cacheDir, entry.cacheFileName)
    )
    const writeFile = vi.spyOn(fs, 'writeFile')
    const rename = vi.spyOn(fs, 'rename')

    await cache.rescan()

    expect(writeFile).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
    const cacheStatAfter = await fs.stat(
      path.join(cacheDir, entry.cacheFileName)
    )
    expect(cacheStatAfter.mtimeMs).toBe(cacheStatBefore.mtimeMs)
  })

  it('keeps the manifest and cache files when the photos directory is unreadable', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    const cache = createCache()
    await cache.init()
    const manifestBefore = await fs.readFile(
      path.join(cacheDir, 'manifest.json'),
      'utf8'
    )
    await fs.rm(photosDir, { recursive: true })

    await expect(cache.rescan()).resolves.toBeUndefined()

    expect(cache.getCount()).toBe(1)
    expect(
      await fs.readFile(path.join(cacheDir, 'manifest.json'), 'utf8')
    ).toBe(manifestBefore)
    const entry = cache.getCachedEntries()[0]
    const stat = await fs.stat(path.join(cacheDir, entry.cacheFileName))
    expect(stat.isFile()).toBe(true)
  })

  it('saves the changes made so far when a later step fails, without rejecting', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    await writeTestPng(path.join(photosDir, 'b.png'), 200, 200)
    const cache = createCache()
    await cache.init()

    await writeTestPng(path.join(photosDir, 'c.png'), 100, 100)
    await fs.rm(path.join(photosDir, 'b.png'))
    vi.spyOn(fs, 'rm').mockRejectedValueOnce(new Error('rm failed'))

    await expect(cache.rescan()).resolves.toBeUndefined()

    expect(
      Object.keys(await readManifest()).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['a.png', 'b.png', 'c.png'])
  })

  it('never runs two reconciles at once and queues at most one rescan', async () => {
    await writeTestPng(path.join(photosDir, 'a.png'), 400, 300)
    const cache = createCache()
    await cache.init()

    let running = 0
    let maxRunning = 0
    let calls = 0
    const { promise: gate, resolve: release } = Promise.withResolvers<undefined>()
    vi.spyOn(
      cache as unknown as { reconcile: () => Promise<unknown> },
      'reconcile'
    ).mockImplementation(async () => {
      calls++
      running++
      maxRunning = Math.max(maxRunning, running)
      await gate
      running--
      return { changed: false, processed: 0, removed: 0 }
    })

    const first = cache.rescan()
    const skippedWhileQueued1 = cache.rescan()
    const skippedWhileQueued2 = cache.rescan()
    await vi.waitFor(() => {
      expect(calls).toBe(1)
    })
    const second = cache.rescan()
    const skippedAgain = cache.rescan()
    release(undefined)
    await Promise.all([
      first,
      skippedWhileQueued1,
      skippedWhileQueued2,
      second,
      skippedAgain,
    ])

    expect(calls).toBe(2)
    expect(maxRunning).toBe(1)
  })

  describe('timer', () => {
    it('does not start a timer when no interval is configured', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      await fs.mkdir(cacheDir, { recursive: true })

      for (const interval of [undefined, 0]) {
        const cache = createCache(interval)
        cache.startWatching()
      }

      expect(setIntervalSpy).not.toHaveBeenCalled()
    })

    it('rescans on every tick and stops after close()', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      await fs.mkdir(cacheDir, { recursive: true })
      const cache = createCache(1000)
      const rescan = vi.spyOn(cache, 'rescan').mockResolvedValue()

      cache.startWatching()
      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)

      await vi.advanceTimersByTimeAsync(3000)
      expect(rescan).toHaveBeenCalledTimes(3)

      await cache.close()
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(3000)
      expect(rescan).toHaveBeenCalledTimes(3)
    })
  })
})
