import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FastifyReply, FastifyRequest } from 'fastify'
import { getBucketIndex, pickDeterministic } from '../deterministic-selector.js'
import { CachedEntry } from '../photo-cache/index.js'
import { PhotoFormat } from '../photo-cache/process.js'
import { PhotoSelector, SelectableItem } from '../photo-selector.js'
import { PhotoCacheReader } from './root.js'

/**
 * PhotoSelector に渡す選択候補。
 * CachedEntry に SelectableItem の id を付与したもの(id には cacheFileName を用いる)
 */
export type Candidate = CachedEntry & SelectableItem

const CONTENT_TYPE_BY_FORMAT: Record<PhotoFormat, string> = {
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
 * candidates からランダムに1件選び、画像バイナリをレスポンスとして送信する。
 * candidates が空、または選択に失敗した場合は 503 を返す
 *
 * @param photoCache キャッシュディレクトリの取得に使う PhotoCache
 * @param photoSelector 画像選択に使う PhotoSelector
 * @param candidates 選択候補の一覧(呼び出し側が向き等でフィルタ済みのもの)
 * @param request Fastify のリクエストオブジェクト(クライアント識別に使用)
 * @param reply Fastify のレスポンスオブジェクト
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
 * candidates から (bucketIndex, photoframeId) の組み合わせに基づき決定論的に1件選び、画像バイナリをレスポンスとして送信する。
 * candidates が空の場合は 503 を返す。同一バケット内であれば複数フォトフレームから同時に呼ばれても同じ画像を返す
 *
 * @param photoCache キャッシュディレクトリの取得に使う PhotoCache
 * @param candidates 選択候補の一覧(呼び出し側が向き等でフィルタ済みのもの)
 * @param bucketWidthSeconds 同一画像を返す時間幅(秒)
 * @param photoframeId フォトフレームを識別する非負整数
 * @param nowMs 現在時刻(エポックミリ秒)
 * @param reply Fastify のレスポンスオブジェクト
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
