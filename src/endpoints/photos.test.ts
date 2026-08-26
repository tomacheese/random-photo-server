import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import fastify, { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CachedEntry } from '../photo-cache/index.js'
import { PhotosRouter } from './photos.js'
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

describe('PhotosRouter', () => {
  let app: FastifyInstance
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photos-router-'))
  })

  afterEach(async () => {
    await app.close()
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  describe('GET /photos/:id', () => {
    it('returns the image bytes with a no-store cache header for an existing id', async () => {
      await fs.writeFile(
        path.join(cacheDir, 'photo.jpg'),
        Buffer.from([1, 2, 3])
      )
      const photoCache = new FakePhotoCache(
        cacheDir,
        [
          {
            relPath: 'a.png',
            cacheFileName: 'photo.jpg',
            format: 'jpeg',
            width: 800,
            height: 600,
          },
        ],
        true
      )

      app = fastify()
      await new PhotosRouter(app, photoCache).init()
      await app.ready()

      const response = await app.inject({
        method: 'GET',
        url: '/photos/photo.jpg',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toBe('image/jpeg')
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.rawPayload).toEqual(Buffer.from([1, 2, 3]))
    })

    it('returns 404 for an unknown id', async () => {
      const photoCache = new FakePhotoCache(cacheDir, [], true)

      app = fastify()
      await new PhotosRouter(app, photoCache).init()
      await app.ready()

      const response = await app.inject({
        method: 'GET',
        url: '/photos/unknown.jpg',
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 503 when the cache is not ready yet', async () => {
      const photoCache = new FakePhotoCache(cacheDir, [], false)

      app = fastify()
      await new PhotosRouter(app, photoCache).init()
      await app.ready()

      const response = await app.inject({
        method: 'GET',
        url: '/photos/photo.jpg',
      })

      expect(response.statusCode).toBe(503)
    })
  })

  describe('GET /photos', () => {
    it('returns 200 with an HTML page listing every cached photo', async () => {
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

      app = fastify()
      await new PhotosRouter(app, photoCache).init()
      await app.ready()

      const response = await app.inject({ method: 'GET', url: '/photos' })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
      expect(response.body).toContain('/photos/portrait.jpg')
      expect(response.body).toContain('/photos/landscape.jpg')
    })

    it('filters by the orientation query parameter', async () => {
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

      app = fastify()
      await new PhotosRouter(app, photoCache).init()
      await app.ready()

      const response = await app.inject({
        method: 'GET',
        url: '/photos?orientation=portrait',
      })

      expect(response.statusCode).toBe(200)
      expect(response.body).toContain('/photos/portrait.jpg')
      expect(response.body).not.toContain('/photos/landscape.jpg')
    })

    it('returns 400 for an invalid orientation value', async () => {
      const photoCache = new FakePhotoCache(cacheDir, [], true)

      app = fastify()
      await new PhotosRouter(app, photoCache).init()
      await app.ready()

      const response = await app.inject({
        method: 'GET',
        url: '/photos?orientation=diagonal',
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 200 with an empty list when there are zero cached photos', async () => {
      const photoCache = new FakePhotoCache(cacheDir, [], true)

      app = fastify()
      await new PhotosRouter(app, photoCache).init()
      await app.ready()

      const response = await app.inject({ method: 'GET', url: '/photos' })

      expect(response.statusCode).toBe(200)
    })

    it('returns 503 when the cache is not ready yet', async () => {
      const photoCache = new FakePhotoCache(cacheDir, [], false)

      app = fastify()
      await new PhotosRouter(app, photoCache).init()
      await app.ready()

      const response = await app.inject({ method: 'GET', url: '/photos' })

      expect(response.statusCode).toBe(503)
    })
  })
})
