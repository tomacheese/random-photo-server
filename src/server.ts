import cors from '@fastify/cors'
import { Logger } from '@book000/node-utils'
import fastify, { FastifyInstance } from 'fastify'
import { BaseRouter } from './endpoints/index.js'
import { OrientationRouter } from './endpoints/orientation.js'
import { RootRouter } from './endpoints/root.js'
import { PhotoCache } from './photo-cache/index.js'
import { PhotoSelector } from './photo-selector.js'

/**
 * Fastify アプリケーションを構築する
 *
 * @param photoCache 初期化・監視開始済みの PhotoCache
 * @param photoSelector 画像選択に使う PhotoSelector
 * @param bucketWidthSeconds タイムスタンプベース配信で同一画像を返す時間幅(秒)
 * @returns Fastify アプリケーション
 */
export async function buildApp(
  photoCache: PhotoCache,
  photoSelector: PhotoSelector,
  bucketWidthSeconds: number
): Promise<FastifyInstance> {
  const logger = Logger.configure('buildApp')

  const app = fastify()
  await app.register(cors, {
    origin: true,
    methods: ['GET'],
  })

  const routers: BaseRouter[] = [
    new RootRouter(app, photoCache, photoSelector),
    new OrientationRouter(app, photoCache, photoSelector, bucketWidthSeconds),
  ]

  for (const router of routers) {
    logger.info(`⏩ Initializing route: ${router.constructor.name}`)
    await router.init()
  }

  logger.info('📃 Routes:')
  for (const element of app.printRoutes().split('\n')) {
    logger.info(element)
  }

  return app
}
