import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoCache } from './photo-cache/index.js'
import { PhotoSelector } from './photo-selector.js'
import { buildApp } from './server.js'

describe('image route rate limiting', () => {
  let app: FastifyInstance
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'server-rate-limit-'))
    await fs.writeFile(path.join(cacheDir, 'portrait.jpg'), Buffer.from([1]))
    await fs.writeFile(path.join(cacheDir, 'landscape.jpg'), Buffer.from([2]))
    const cache = new PhotoCache({
      photosDir: cacheDir,
      cacheDir,
      maxEdgePx: 2048,
      jpegQuality: 82,
    })
    vi.spyOn(cache, 'isReady').mockReturnValue(true)
    vi.spyOn(cache, 'getCount').mockReturnValue(2)
    vi.spyOn(cache, 'getCachedEntries').mockReturnValue([
      {
        relPath: 'portrait.png',
        cacheFileName: 'portrait.jpg',
        format: 'jpeg',
        width: 600,
        height: 800,
      },
      {
        relPath: 'landscape.png',
        cacheFileName: 'landscape.jpg',
        format: 'jpeg',
        width: 800,
        height: 600,
      },
    ])
    app = await buildApp(
      cache,
      new PhotoSelector({ dedupeWindowMs: 60_000 }),
      180
    )
  })

  afterEach(async () => {
    await app.close()
    await fs.rm(cacheDir, { recursive: true, force: true })
  })

  it.each([
    '/',
    '/portrait',
    '/landscape',
    '/portrait/1',
    '/landscape/1',
    '/photos/portrait.jpg',
  ])('limits requests to %s', async (url) => {
    for (let i = 0; i < 60; i++) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(200)
    }
    const response = await app.inject({ method: 'GET', url })
    expect(response.statusCode).toBe(429)
  })

  it('shares the image budget across routes per client without limiting health or the list', async () => {
    const urls = [
      '/',
      '/portrait',
      '/landscape',
      '/portrait/1',
      '/landscape/1',
      '/photos/portrait.jpg',
    ]
    for (let i = 0; i < 60; i++) {
      const response = await app.inject({
        method: 'GET',
        url: urls[i % urls.length],
        remoteAddress: '192.0.2.1',
      })
      expect(response.statusCode).toBe(200)
    }
    const limited = await app.inject({
      method: 'GET',
      url: '/',
      remoteAddress: '192.0.2.1',
    })
    expect(limited.statusCode).toBe(429)
    const otherClient = await app.inject({
      method: 'GET',
      url: '/',
      remoteAddress: '192.0.2.2',
    })
    expect(otherClient.statusCode).toBe(200)
    for (const url of ['/health', '/photos']) {
      for (let i = 0; i < 61; i++) {
        const response = await app.inject({
          method: 'GET',
          url,
          remoteAddress: '192.0.2.1',
        })
        expect(response.statusCode).toBe(200)
      }
    }
  })
})
