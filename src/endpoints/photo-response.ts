import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FastifyReply, FastifyRequest } from 'fastify'
import { getBucketIndex, pickDeterministic } from '../deterministic-selector.js'
import { CachedEntry } from '../photo-cache/index.js'
import { PhotoFormat } from '../photo-cache/process.js'
import { PhotoSelector, SelectableItem } from '../photo-selector.js'
import { PhotoCacheReader } from './root.js'

/**
 * Selection candidate: a CachedEntry with a SelectableItem id (the id is the cacheFileName).
 */
export type Candidate = CachedEntry & SelectableItem

export const CONTENT_TYPE_BY_FORMAT: Record<PhotoFormat, string> = {
  jpeg: 'image/jpeg',
}

async function sendPhoto(
  photoCache: PhotoCacheReader,
  picked: Candidate,
  reply: FastifyReply
): Promise<void> {
  const contentType = CONTENT_TYPE_BY_FORMAT[picked.format]
  const buffer = await fs.readFile(
    path.join(photoCache.getCacheDir(), picked.cacheFileName)
  )
  await reply
    .header('Content-Type', contentType)
    .header('Cache-Control', 'no-store')
    .send(buffer)
}

/**
 * Picks one candidate at random and sends the image bytes as the response.
 * Responds with 503 if candidates is empty or nothing could be picked.
 *
 * @param photoCache Provides the cache directory
 * @param photoSelector Selector used for the pick
 * @param candidates Candidates, already filtered (e.g. by orientation) by the caller
 * @param request Fastify request (its IP identifies the client)
 * @param reply Fastify reply
 */
export async function servePickedPhoto(
  photoCache: PhotoCacheReader,
  photoSelector: PhotoSelector,
  candidates: Candidate[],
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const picked = photoSelector.pick(candidates, request.ip, Date.now())
  if (!picked) {
    await reply.code(503).send({ message: 'No photos available' })
    return
  }
  await sendPhoto(photoCache, picked, reply)
}

/**
 * Deterministically picks one candidate from the (bucketIndex, photoframeId)
 * pair and sends the image bytes as the response. Responds with 503 if
 * candidates is empty. Within one bucket, the same photoframeId always gets the same photo.
 *
 * @param photoCache Provides the cache directory
 * @param candidates Candidates, already filtered (e.g. by orientation) by the caller
 * @param bucketWidthSeconds Time window (seconds) during which the same photo is returned
 * @param photoframeId Non-negative integer identifying the photo frame
 * @param nowMs Current time in epoch milliseconds
 * @param reply Fastify reply
 */
export async function serveDeterministicPhoto(
  photoCache: PhotoCacheReader,
  candidates: Candidate[],
  bucketWidthSeconds: number,
  photoframeId: number,
  nowMs: number,
  reply: FastifyReply
): Promise<void> {
  const bucketIndex = getBucketIndex(nowMs, bucketWidthSeconds)
  const picked = pickDeterministic(candidates, bucketIndex, photoframeId)
  if (!picked) {
    await reply.code(503).send({ message: 'No photos available' })
    return
  }
  await sendPhoto(photoCache, picked, reply)
}
