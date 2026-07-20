import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { BaseRouter } from './index.js'
import { Candidate, servePickedPhoto } from './photo-response.js'
import { PhotoCacheReader } from './root.js'
import { getPhotoOrientation, PhotoOrientation } from '../photo-orientation.js'
import { PhotoSelector } from '../photo-selector.js'

type FilterableOrientation = Exclude<PhotoOrientation, 'square'>

/**
 * 写真の向き(縦長・横長)でフィルタリングしたランダム画像配信エンドポイントを
 * 提供するルーター
 */
export class OrientationRouter extends BaseRouter {
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
    this.fastify.get('/portrait', this.routeGetPortrait.bind(this))
    this.fastify.get('/landscape', this.routeGetLandscape.bind(this))
    return Promise.resolve()
  }

  private async routeGetPortrait(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    await this.serveByOrientation('portrait', request, reply)
  }

  private async routeGetLandscape(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    await this.serveByOrientation('landscape', request, reply)
  }

  private async serveByOrientation(
    orientation: FilterableOrientation,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!this.photoCache.isReady()) {
      await reply.code(503).send({ message: 'No photos available' })
      return
    }

    const candidates: Candidate[] = this.photoCache
      .getCachedEntries()
      .filter(
        (entry) =>
          getPhotoOrientation(entry.width, entry.height) === orientation
      )
      .map((entry) => ({ ...entry, id: entry.cacheFileName }))
    await servePickedPhoto(
      this.photoCache,
      this.photoSelector,
      candidates,
      request,
      reply
    )
  }
}
