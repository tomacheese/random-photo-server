import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fastify, { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CachedEntry } from '../photo-cache/index.js'
import { PhotoSelector } from '../photo-selector.js'
import { PhotoCacheReader, RootRouter } from './root.js'

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

describe('RootRouter', () => {
  let app: FastifyInstance
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'root-router-'))
  })

  afterEach(async () => {
    await app.close()
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it('returns the image bytes with a no-store cache header on GET /', async () => {
    await fs.writeFile(path.join(cacheDir, 'photo.jpg'), Buffer.from([1, 2, 3]))
    const photoCache = new FakePhotoCache(
      cacheDir,
      [{ relPath: 'a.png', cacheFileName: 'photo.jpg', format: 'jpeg' }],
      true
    )
    const photoSelector = new PhotoSelector({
      dedupeWindowMs: 60_000,
      randomFn: () => 0,
    })

    app = fastify()
    await new RootRouter(app, photoCache, photoSelector).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/jpeg')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.rawPayload).toEqual(Buffer.from([1, 2, 3]))
  })

  it('returns 503 on GET / when the cache is not ready yet', async () => {
    const photoCache = new FakePhotoCache(cacheDir, [], false)
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new RootRouter(app, photoCache, photoSelector).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/' })

    expect(response.statusCode).toBe(503)
  })

  it('returns 503 on GET / when there are zero cached photos', async () => {
    const photoCache = new FakePhotoCache(cacheDir, [], true)
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new RootRouter(app, photoCache, photoSelector).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/' })

    expect(response.statusCode).toBe(503)
  })

  it('reports readiness and count on GET /health', async () => {
    const photoCache = new FakePhotoCache(
      cacheDir,
      [{ relPath: 'a.png', cacheFileName: 'photo.jpg', format: 'jpeg' }],
      true
    )
    const photoSelector = new PhotoSelector({ dedupeWindowMs: 60_000 })

    app = fastify()
    await new RootRouter(app, photoCache, photoSelector).init()
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ready: true, count: 1 })
  })
})
