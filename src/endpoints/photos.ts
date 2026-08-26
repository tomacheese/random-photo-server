import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { BaseRouter } from './index.js'
import { FilterableOrientation } from './orientation.js'
import { CONTENT_TYPE_BY_FORMAT } from './photo-response.js'
import { PhotoCacheReader } from './root.js'
import { CachedEntry } from '../photo-cache/index.js'
import { getPhotoOrientation } from '../photo-orientation.js'

/**
 * キャッシュ済み画像一覧を表示するサムネイルグリッドの HTML を組み立てる。
 * 埋め込む値は id(内部生成のハッシュ)・width/height(数値)・orientation(固定文字列)のみで、
 * いずれも外部入力をそのまま埋め込むものではないため追加のエスケープ処理は行わない
 *
 * @param entries 表示対象のキャッシュ済み画像一覧
 * @returns サムネイルグリッドを表示する HTML 文字列
 */
function renderPhotoListHtml(entries: CachedEntry[]): string {
  const items = entries
    .map((entry) => {
      const orientation = getPhotoOrientation(entry.width, entry.height)
      return `<li><a href="/photos/${entry.cacheFileName}"><img src="/photos/${entry.cacheFileName}" loading="lazy" /></a><p>${entry.width}x${entry.height} (${orientation})</p></li>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>Photos (${entries.length})</title>
<style>
body { font-family: sans-serif; margin: 16px; }
.grid { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; }
.grid li { width: 200px; }
.grid img { max-width: 100%; height: auto; display: block; }
</style>
</head>
<body>
<h1>Photos (${entries.length})</h1>
<ul class="grid">
${items}
</ul>
</body>
</html>
`
}

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
    this.fastify.get('/photos', this.routeGetPhotoList.bind(this))
    this.fastify.get('/photos/:id', this.routeGetPhotoById.bind(this))
    return Promise.resolve()
  }

  private async routeGetPhotoList(
    request: FastifyRequest<{ Querystring: { orientation?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    if (!this.photoCache.isReady()) {
      await reply.code(503).send({ message: 'No photos available' })
      return
    }

    const rawOrientation = request.query.orientation
    if (
      rawOrientation !== undefined &&
      rawOrientation !== 'portrait' &&
      rawOrientation !== 'landscape'
    ) {
      await reply
        .code(400)
        .send({ message: `Invalid orientation: ${rawOrientation}` })
      return
    }
    const orientation: FilterableOrientation | undefined = rawOrientation

    const entries = this.photoCache
      .getCachedEntries()
      .filter(
        (entry) =>
          orientation === undefined ||
          getPhotoOrientation(entry.width, entry.height) === orientation
      )

    await reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(renderPhotoListHtml(entries))
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
