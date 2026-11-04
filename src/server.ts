import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { Logger } from '@book000/node-utils'
import fastify, { FastifyInstance } from 'fastify'
import { BaseRouter } from './endpoints/index.js'
import { OrientationRouter } from './endpoints/orientation.js'
import { PhotosRouter } from './endpoints/photos.js'
import { RootRouter } from './endpoints/root.js'
import { PhotoCache } from './photo-cache/index.js'
import { PhotoSelector } from './photo-selector.js'

/**
 * Builds the Fastify application and registers all routers.
 *
 * @param photoCache A PhotoCache that has already been initialized and is being watched
 * @param photoSelector Selector used for random picks
 * @param bucketWidthSeconds Time window (seconds) during which the deterministic endpoints return the same photo
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
  // With global: false, only routes that set config.rateLimit are rate limited
  await app.register(rateLimit, { global: false })

  const routers: BaseRouter[] = [
    new RootRouter(app, photoCache, photoSelector),
    new OrientationRouter(app, photoCache, photoSelector, bucketWidthSeconds),
    new PhotosRouter(app, photoCache),
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
