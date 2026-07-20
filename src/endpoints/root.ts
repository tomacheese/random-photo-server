import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { BaseRouter } from './index.js'
import { CachedEntry } from '../photo-cache/index.js'
import { PhotoFormat } from '../photo-cache/process.js'
import { PhotoSelector, SelectableItem } from '../photo-selector.js'

/**
 * RootRouter が必要とする PhotoCache の最小インターフェース
 */
export interface PhotoCacheReader {
  isReady(): boolean
  getCount(): number
  getCachedEntries(): CachedEntry[]
  getCacheDir(): string
}

type Candidate = CachedEntry & SelectableItem

const CONTENT_TYPE_BY_FORMAT: Record<PhotoFormat, string> = {
  jpeg: 'image/jpeg',
}

/**
 * ルートエンドポイント(ランダム画像配信・ヘルスチェック)を提供するルーター
 */
export class RootRouter extends BaseRouter {
  private readonly photoCache: PhotoCacheReader
  private readonly photoSelector: PhotoSelector

  constructor(
    fastify: FastifyInstance,
    photoCache: PhotoCacheReader,
    photoSelector: PhotoSelector
  ) {
    super(fastify)
    this.photoCache = photoCache
    this.photoSelector = photoSelector
  }

  init(): Promise<void> {
    this.fastify.get('/', this.routeGetRandomPhoto.bind(this))
    this.fastify.get('/health', this.routeGetHealth.bind(this))
    return Promise.resolve()
  }

  private async routeGetRandomPhoto(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!this.photoCache.isReady() || this.photoCache.getCount() === 0) {
      await reply.code(503).send({ message: 'No photos available' })
      return
    }

    const candidates: Candidate[] = this.photoCache
      .getCachedEntries()
      .map((entry) => ({ ...entry, id: entry.cacheFileName }))
    const picked = this.photoSelector.pick(candidates, request.ip, Date.now())
    if (!picked) {
      await reply.code(503).send({ message: 'No photos available' })
      return
    }

    const contentType = CONTENT_TYPE_BY_FORMAT[picked.format]
    const buffer = await fs.readFile(
      path.join(this.photoCache.getCacheDir(), picked.cacheFileName)
    )
    await reply
      .header('Content-Type', contentType)
      .header('Cache-Control', 'no-store')
      .send(buffer)
  }

  private async routeGetHealth(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    await reply.send({
      ready: this.photoCache.isReady(),
      count: this.photoCache.getCount(),
    })
  }
}
