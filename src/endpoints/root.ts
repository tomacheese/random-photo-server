import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { BaseRouter } from './index.js'
import { Candidate, servePickedPhoto } from './photo-response.js'
import { CachedEntry } from '../photo-cache/index.js'
import { PhotoSelector } from '../photo-selector.js'

/**
 * RootRouter が必要とする PhotoCache の最小インターフェース
 */
export interface PhotoCacheReader {
  isReady(): boolean
  getCount(): number
  getCachedEntries(): CachedEntry[]
  getCacheDir(): string
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
    await servePickedPhoto(
      this.photoCache,
      this.photoSelector,
      candidates,
      request,
      reply
    )
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
