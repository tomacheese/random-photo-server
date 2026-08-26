import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { BaseRouter } from './index.js'
import { CONTENT_TYPE_BY_FORMAT } from './photo-response.js'
import { PhotoCacheReader } from './root.js'

/**
 * キャッシュ済み画像の一覧表示(HTML)・個別取得を提供するルーター
 */
export class PhotosRouter extends BaseRouter {
  private readonly photoCache: PhotoCacheReader

  constructor(fastify: FastifyInstance, photoCache: PhotoCacheReader) {
    super(fastify)
    this.photoCache = photoCache
  }

  init(): Promise<void> {
    this.fastify.get('/photos/:id', this.routeGetPhotoById.bind(this))
    return Promise.resolve()
  }

  private async routeGetPhotoById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    if (!this.photoCache.isReady()) {
      await reply.code(503).send({ message: 'No photos available' })
      return
    }

    const entry = this.photoCache
      .getCachedEntries()
      .find((candidate) => candidate.cacheFileName === request.params.id)
    if (!entry) {
      await reply.code(404).send({ message: 'Photo not found' })
      return
    }

    const contentType = CONTENT_TYPE_BY_FORMAT[entry.format]
    const buffer = await fs.readFile(
      path.join(this.photoCache.getCacheDir(), entry.cacheFileName)
    )
    await reply
      .header('Content-Type', contentType)
      .header('Cache-Control', 'no-store')
      .send(buffer)
  }
}
