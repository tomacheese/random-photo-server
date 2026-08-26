import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fastify, { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CachedEntry } from '../photo-cache/index.js'
import { PhotoSelector } from '../photo-selector.js'
import { OrientationRouter } from './orientation.js'
import { PhotoCacheReader } from './root.js'

class FakePhotoCache implements PhotoCacheReader {
  constructor(
    private readonly cacheDir: string,
    private readonly entries: CachedEntry[],
    private readonly ready: boolean
  ) {}

  isReady(): boolean {
    return this.ready
  }

  getCount(): number {
    return this.entries.length
  }

  getCachedEntries(): CachedEntry[] {
    return this.entries
  }

  getCacheDir(): string {
    return this.cacheDir
  }
}

describe('OrientationRouter', () => {
  let app: FastifyInstance
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orientation-router-'))
  })

  afterEach(async () => {
    await app.close()
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('returns only a portrait photo on GET /portrait', async () => {
    await fs.writeFile(path.join(cacheDir, 'portrait.jpg'), Buffer.from([1]))
    await fs.writeFile(path.join(cacheDir, 'landscape.jpg'), Buffer.from([2]))
    const photoCache = new FakePhotoCache(
      cacheDir,
      [
        {
          relPath: 'p.png',
          cacheFileName: 'portrait.jpg',
          format: 'jpeg',
          width: 900,
          height: 1600,
        },
        {
          relPath: 'l.png',
          cacheFileName: 'landscape.jpg',
          format: 'jpeg',
          width: 1600,
          height: 900,
        },
      ],
      true
    )
    const photoSelector = new PhotoSelector({
      dedupeWindowMs: 60_000,
      randomFn: () => 0,
    })

    app = fastify()
    await new OrientationRouter(app, photoCache, photoSelector, 180).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/portrait' })

    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(Buffer.from([1]))
  })

  it('returns only a landscape photo on GET /landscape', async () => {
    await fs.writeFile(path.join(cacheDir, 'portrait.jpg'), Buffer.from([1]))
    await fs.writeFile(path.join(cacheDir, 'landscape.jpg'), Buffer.from([2]))
    const photoCache = new FakePhotoCache(
      cacheDir,
      [
        {
          relPath: 'p.png',
          cacheFileName: 'portrait.jpg',
          format: 'jpeg',
          width: 900,
          height: 1600,
        },
        {
          relPath: 'l.png',
          cacheFileName: 'landscape.jpg',
          format: 'jpeg',
          width: 1600,
          height: 900,
        },
      ],
      true
    )
    const photoSelector = new PhotoSelector({
      dedupeWindowMs: 60_000,
      randomFn: () => 0,
    })

    app = fastify()
    await new OrientationRouter(app, photoCache, photoSelector, 180).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/landscape' })

    expect(response.statusCode).toBe(200)
    expect(response.rawPayload).toEqual(Buffer.from([2]))
  })

  it('excludes near-square photos from both /portrait and /landscape', async () => {
    const photoCache = new FakePhotoCache(
      cacheDir,
      [
        {
          relPath: 's.png',
          cacheFileName: 'square.jpg',
          format: 'jpeg',
          width: 1000,
          height: 1000,
        },
      ],
      true
    )
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new OrientationRouter(app, photoCache, photoSelector, 180).init()
    await app.ready()

    const portraitResponse = await app.inject({
      method: 'GET',
      url: '/portrait',
    })
    const landscapeResponse = await app.inject({
      method: 'GET',
      url: '/landscape',
    })

    expect(portraitResponse.statusCode).toBe(503)
    expect(landscapeResponse.statusCode).toBe(503)
  })

  it('returns 503 on GET /portrait when the cache is not ready yet', async () => {
    const photoCache = new FakePhotoCache(cacheDir, [], false)
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new OrientationRouter(app, photoCache, photoSelector, 180).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/portrait' })

    expect(response.statusCode).toBe(503)
  })

  it('returns the same photo for repeated requests to the same photoframeId within a bucket', async () => {
    await fs.writeFile(path.join(cacheDir, 'landscape-a.jpg'), Buffer.from([1]))
    await fs.writeFile(path.join(cacheDir, 'landscape-b.jpg'), Buffer.from([2]))
    const photoCache = new FakePhotoCache(
      cacheDir,
      [
        {
          relPath: 'a.png',
          cacheFileName: 'landscape-a.jpg',
          format: 'jpeg',
          width: 1600,
          height: 900,
        },
        {
          relPath: 'b.png',
          cacheFileName: 'landscape-b.jpg',
          format: 'jpeg',
          width: 1600,
          height: 900,
        },
      ],
      true
    )
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new OrientationRouter(app, photoCache, photoSelector, 180).init()
    await app.ready()

    const first = await app.inject({ method: 'GET', url: '/landscape/0' })
    const second = await app.inject({ method: 'GET', url: '/landscape/0' })

    expect(first.statusCode).toBe(200)
    expect(second.rawPayload).toEqual(first.rawPayload)
  })

  it('returns 400 on GET /landscape/:photoframeId when photoframeId is not a non-negative integer', async () => {
    const photoCache = new FakePhotoCache(cacheDir, [], true)
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new OrientationRouter(app, photoCache, photoSelector, 180).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/landscape/-1' })

    expect(response.statusCode).toBe(400)
  })

  it('returns 503 on GET /portrait/:photoframeId when the cache is not ready yet', async () => {
    const photoCache = new FakePhotoCache(cacheDir, [], false)
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new OrientationRouter(app, photoCache, photoSelector, 180).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/portrait/0' })

    expect(response.statusCode).toBe(503)
  })

  it('returns 503 on GET /portrait/:photoframeId when no orientation-matching candidates exist', async () => {
    const photoCache = new FakePhotoCache(
      cacheDir,
      [
        {
          relPath: 's.png',
          cacheFileName: 'square.jpg',
          format: 'jpeg',
          width: 1000,
          height: 1000,
        },
      ],
      true
    )
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new OrientationRouter(app, photoCache, photoSelector, 180).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/portrait/0' })

    expect(response.statusCode).toBe(503)
  })
})
