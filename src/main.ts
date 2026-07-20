import { Logger } from '@book000/node-utils'
import { ENV } from './environments.js'
import { PhotoCache } from './photo-cache/index.js'
import { PhotoSelector } from './photo-selector.js'
import { buildApp } from './server.js'

async function main() {
  if (ENV.OUTPUT_FORMAT !== 'jpeg') {
    throw new Error(
      `Unsupported OUTPUT_FORMAT: "${ENV.OUTPUT_FORMAT}" (only "jpeg" is currently supported)`
    )
  }

  const logger = Logger.configure('main')

  const photoCache = new PhotoCache({
    photosDir: ENV.PHOTOS_DIR,
    cacheDir: ENV.CACHE_DIR,
    maxEdgePx: Number.parseInt(ENV.MAX_EDGE_PX, 10),
    jpegQuality: Number.parseInt(ENV.JPEG_QUALITY, 10),
  })

  logger.info('🔄 Running initial photo scan')
  await photoCache.init()
  photoCache.startWatching()
  logger.info('👀 Watching photos directory for changes')

  const photoSelector = new PhotoSelector({
    dedupeWindowMs: Number.parseInt(ENV.DEDUPE_WINDOW_SEC, 10) * 1000,
  })

  const app = await buildApp(photoCache, photoSelector)
  const host = ENV.API_HOST
  const port = Number.parseInt(ENV.API_PORT, 10)
  app.listen({ host, port }, (error, address) => {
    if (error) {
      logger.error('❌ Fastify.listen error', error)
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(1)
    }
    logger.info(`✅ Server listening at ${address}`)
  })
}

;(async () => {
  await main()
})().catch((error: unknown) => {
  Logger.configure('main').error(
    '❌ Fatal error during startup',
    error as Error
  )
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
})
