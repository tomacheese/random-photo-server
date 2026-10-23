import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
