import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { BaseRouter } from './index.js'
import {
  Candidate,
  serveDeterministicPhoto,
  servePickedPhoto,
} from './photo-response.js'
import { PhotoCacheReader } from './root.js'
import { getPhotoOrientation, PhotoOrientation } from '../photo-orientation.js'
import { PhotoSelector } from '../photo-selector.js'

type FilterableOrientation = Exclude<PhotoOrientation, 'square'>

interface PhotoframeParams {
  photoframeId: string
}

/**
 * 写真の向き(縦長・横長)でフィルタリングした画像配信エンドポイントを提供するルーター。
 * `/portrait`・`/landscape` はランダムに選び、`/portrait/:photoframeId`・`/landscape/:photoframeId` はリクエスト時刻とフォトフレーム番号に基づき決定論的に選ぶ
 */
export class OrientationRouter extends BaseRouter {
  private readonly photoCache: PhotoCacheReader
  private readonly photoSelector: PhotoSelector
  private readonly bucketWidthSeconds: number

  constructor(
    fastify: FastifyInstance,
    photoCache: PhotoCacheReader,
    photoSelector: PhotoSelector,
    bucketWidthSeconds: number
  ) {
    super(fastify)
    this.photoCache = photoCache
    this.photoSelector = photoSelector
    this.bucketWidthSeconds = bucketWidthSeconds
  }

  init(): Promise<void> {
    this.fastify.get('/portrait', this.routeGetPortrait.bind(this))
    this.fastify.get('/landscape', this.routeGetLandscape.bind(this))
    this.fastify.get<{ Params: PhotoframeParams }>(
      '/portrait/:photoframeId',
      this.routeGetPortraitByFrame.bind(this)
    )
    this.fastify.get<{ Params: PhotoframeParams }>(
      '/landscape/:photoframeId',
      this.routeGetLandscapeByFrame.bind(this)
    )
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

  private async routeGetPortraitByFrame(
    request: FastifyRequest<{ Params: PhotoframeParams }>,
    reply: FastifyReply
  ): Promise<void> {
    await this.serveByOrientationForFrame('portrait', request, reply)
  }

  private async routeGetLandscapeByFrame(
    request: FastifyRequest<{ Params: PhotoframeParams }>,
    reply: FastifyReply
  ): Promise<void> {
    await this.serveByOrientationForFrame('landscape', request, reply)
  }

  private getCandidates(orientation: FilterableOrientation): Candidate[] {
    return this.photoCache
      .getCachedEntries()
      .filter(
        (entry) =>
          getPhotoOrientation(entry.width, entry.height) === orientation
      )
      .map((entry) => ({ ...entry, id: entry.cacheFileName }))
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

    await servePickedPhoto(
      this.photoCache,
      this.photoSelector,
      this.getCandidates(orientation),
      request,
      reply
    )
  }

  private async serveByOrientationForFrame(
    orientation: FilterableOrientation,
    request: FastifyRequest<{ Params: PhotoframeParams }>,
    reply: FastifyReply
  ): Promise<void> {
    const photoframeId = Number.parseInt(request.params.photoframeId, 10)
    if (
      !Number.isSafeInteger(photoframeId) ||
      photoframeId < 0 ||
      String(photoframeId) !== request.params.photoframeId
    ) {
      await reply
        .code(400)
        .send({ message: 'photoframeId must be a non-negative integer' })
      return
    }

    if (!this.photoCache.isReady()) {
      await reply.code(503).send({ message: 'No photos available' })
      return
    }

    await serveDeterministicPhoto(
      this.photoCache,
      this.getCandidates(orientation),
      this.bucketWidthSeconds,
      photoframeId,
      Date.now(),
      reply
    )
  }
}
