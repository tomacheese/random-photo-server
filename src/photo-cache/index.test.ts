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
    }
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
})
