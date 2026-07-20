import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Logger } from '@book000/node-utils'
import chokidar, { FSWatcher } from 'chokidar'
import {
  computeSourceHash,
  diffManifest,
  isValidManifest,
  Manifest,
  SourceFile,
} from './manifest.js'
import { PhotoFormat, processImage } from './process.js'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

/**
 * 配信可能な、キャッシュ済み画像 1 件分の情報
 */
export interface CachedEntry {
  relPath: string
  cacheFileName: string
  format: PhotoFormat
  width: number
  height: number
}

/**
 * PhotoCache の構築オプション
 */
export interface PhotoCacheOptions {
  photosDir: string
  cacheDir: string
  maxEdgePx: number
  jpegQuality: number
}

/**
 * photos/ を走査してリサイズ・圧縮済み画像を cacheDir に保持し、
 * photos/ の変更を監視して差分更新するクラス
 */
export class PhotoCache {
  private readonly logger = Logger.configure('PhotoCache')
  private readonly options: PhotoCacheOptions
  private manifest: Manifest = {}
  private ready = false
  private watcher: FSWatcher | null = null
  private cacheWatcher: FSWatcher | null = null
  private cachedEntries: CachedEntry[] | null = null
  // Serializes watcher-event handling so overlapping add/change/unlink
  // events for the same relPath cannot interleave and corrupt the manifest
  private eventChain: Promise<void> = Promise.resolve()
  // Serializes and coalesces manifest writes: bursts of saveManifest() calls
  // collapse into the minimum number of writes needed to persist the latest state
  private saveChain: Promise<void> = Promise.resolve()
  private saveRequested = false

  /**
   * @param options - キャッシュ対象ディレクトリやリサイズ設定
   */
  constructor(options: PhotoCacheOptions) {
    this.options = options
  }

  private get manifestPath(): string {
    return path.join(this.options.cacheDir, 'manifest.json')
  }

  private cacheFileNameFor(relPath: string): string {
    const hash = createHash('sha1').update(relPath).digest('hex')
    return `${hash}.jpg`
  }

  /**
   * photos/ を走査し、manifest との差分に基づいて cacheDir を最新化する。
   * 配信を開始する前に必ず一度完了させること
   */
  async init(): Promise<void> {
    await fs.mkdir(this.options.cacheDir, { recursive: true })
    this.manifest = await this.loadManifest()

    const sourceFiles = await this.scanPhotosDir()
    const { toProcess, toRemove } = diffManifest(sourceFiles, this.manifest)

    for (const file of toProcess) {
      await this.processAndRecord(file)
    }
    for (const relPath of toRemove) {
      await this.removeEntry(relPath)
    }

    await this.saveManifest()
    this.ready = true
    this.logger.info(
      `✅ Initial scan complete: ${Object.keys(this.manifest).length} photos cached`
    )
  }

  /**
   * photos/ の追加・変更・削除、および cacheDir 内ファイルの外部削除を監視し、
   * キャッシュを差分更新し続ける
   */
  startWatching(): void {
    this.watcher = chokidar.watch(this.options.photosDir, {
      ignoreInitial: true,
    })
    this.watcher.on('add', (filePath: string) => {
      this.enqueueEvent(() => this.handleChange(filePath))
    })
    this.watcher.on('change', (filePath: string) => {
      this.enqueueEvent(() => this.handleChange(filePath))
    })
    this.watcher.on('unlink', (filePath: string) => {
      this.enqueueEvent(() => this.handleRemove(filePath))
    })
    this.watcher.on('error', (error: unknown) => {
      this.logger.error('❌ Watcher error', error as Error)
    })

    // cacheDir is watched separately (depth 0, no recursion into subdirectories)
    // so a cache file deleted outside this process (manual deletion, script
    // error) doesn't leave a manifest entry pointing at a missing file forever
    this.cacheWatcher = chokidar.watch(this.options.cacheDir, {
      ignoreInitial: true,
      depth: 0,
    })
    this.cacheWatcher.on('unlink', (filePath: string) => {
      this.enqueueEvent(() => this.handleCacheFileRemoved(filePath))
    })
    this.cacheWatcher.on('error', (error: unknown) => {
      this.logger.error('❌ Cache watcher error', error as Error)
    })
  }

  /**
   * ファイル監視を停止する
   */
  async close(): Promise<void> {
    await this.watcher?.close()
    await this.cacheWatcher?.close()
  }

  private enqueueEvent(task: () => Promise<void>): void {
    this.eventChain = this.eventChain.then(task).catch((error: unknown) => {
      this.logger.error('❌ Failed to process watcher event', error as Error)
    })
  }

  /**
   * 初回走査が完了しているかどうか
   * @returns 初回走査が完了していれば true
   */
  isReady(): boolean {
    return this.ready
  }

  /**
   * 現在キャッシュ済みの写真枚数
   * @returns キャッシュ済み写真の枚数
   */
  getCount(): number {
    return Object.keys(this.manifest).length
  }

  /**
   * キャッシュディレクトリの絶対パス
   * @returns キャッシュディレクトリのパス
   */
  getCacheDir(): string {
    return this.options.cacheDir
  }

  /**
   * 現在配信可能なキャッシュ済み画像の一覧
   * @returns キャッシュ済み画像のエントリ一覧
   */
  getCachedEntries(): CachedEntry[] {
    this.cachedEntries ??= Object.entries(this.manifest).map(
      ([relPath, entry]) => ({
        relPath,
        cacheFileName: entry.cacheFileName,
        format: entry.format,
        width: entry.width,
        height: entry.height,
      })
    )
    return this.cachedEntries
  }

  private async handleChange(filePath: string): Promise<void> {
    if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      return
    }
    const relPath = this.toRelPath(filePath)
    try {
      const stat = await fs.stat(filePath)
      const hash = computeSourceHash(stat.size, stat.mtimeMs)
      if (
        Object.hasOwn(this.manifest, relPath) &&
        this.manifest[relPath].hash === hash
      ) {
        return
      }
      const processed = await this.processAndRecord({
        relPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      })
      if (!processed) {
        return
      }
      await this.saveManifest()
      this.logger.info(`🔄 Reprocessed changed photo: ${relPath}`)
    } catch (error) {
      this.logger.error(
        `❌ Failed to process changed photo: ${relPath}`,
        error as Error
      )
    }
  }

  private async handleRemove(filePath: string): Promise<void> {
    const relPath = this.toRelPath(filePath)
    if (!Object.hasOwn(this.manifest, relPath)) {
      return
    }
    try {
      await this.removeEntry(relPath)
      await this.saveManifest()
      this.logger.info(`🗑️ Removed photo from cache: ${relPath}`)
    } catch (error) {
      this.logger.error(
        `❌ Failed to remove photo from cache: ${relPath}`,
        error as Error
      )
    }
  }

  private async handleCacheFileRemoved(filePath: string): Promise<void> {
    const cacheFileName = path.basename(filePath)
    if (cacheFileName === path.basename(this.manifestPath)) {
      return
    }
    const relPath = Object.keys(this.manifest).find(
      (key) => this.manifest[key].cacheFileName === cacheFileName
    )
    if (relPath === undefined) {
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.manifest[relPath]
    await this.saveManifest()
    this.logger.info(
      `🗑️ Cache file removed externally, dropped manifest entry: ${relPath}`
    )
  }

  private toRelPath(filePath: string): string {
    return path
      .relative(this.options.photosDir, filePath)
      .split(path.sep)
      .join('/')
  }

  /**
   * 画像を1件処理して manifest に記録する
   * @param file 処理対象の元ファイル情報
   * @returns 処理に成功した場合は true、失敗した場合は false
   */
  private async processAndRecord(file: SourceFile): Promise<boolean> {
    const cacheFileName = this.cacheFileNameFor(file.relPath)
    const inputPath = path.join(this.options.photosDir, file.relPath)
    const outputPath = path.join(this.options.cacheDir, cacheFileName)
    try {
      const result = await processImage(inputPath, outputPath, {
        maxEdgePx: this.options.maxEdgePx,
        quality: this.options.jpegQuality,
      })
      this.manifest[file.relPath] = {
        hash: computeSourceHash(file.size, file.mtimeMs),
        cacheFileName,
        format: result.format,
        width: result.width,
        height: result.height,
      }
      return true
    } catch (error) {
      this.logger.error(
        `❌ Failed to process photo: ${file.relPath}`,
        error as Error
      )
      return false
    }
  }

  private async removeEntry(relPath: string): Promise<void> {
    if (!Object.hasOwn(this.manifest, relPath)) {
      return
    }
    const entry = this.manifest[relPath]
    const cachePath = path.join(this.options.cacheDir, entry.cacheFileName)
    await fs.rm(cachePath, { force: true })
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.manifest[relPath]
  }

  private async loadManifest(): Promise<Manifest> {
    try {
      const raw = await fs.readFile(this.manifestPath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!isValidManifest(parsed)) {
        this.logger.error(
          `❌ Manifest at ${this.manifestPath} has an unexpected shape, starting fresh`
        )
        return {}
      }
      return parsed
    } catch (error) {
      // A missing file is expected on first run; anything else (corrupted
      // JSON, permission error) is worth logging so it isn't mistaken for one
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error(
          `❌ Failed to load manifest at ${this.manifestPath}, starting fresh`,
          error as Error
        )
      }
      return {}
    }
  }

  private async saveManifest(): Promise<void> {
    this.cachedEntries = null
    this.saveRequested = true
    const chain = this.saveChain.then(() => this.flushManifest())
    this.saveChain = chain
    await chain
  }

  private async flushManifest(): Promise<void> {
    if (!this.saveRequested) {
      // Coalesced away: a later saveManifest() call already captured and
      // persisted the state this call would have written
      return
    }
    this.saveRequested = false
    const tmpPath = `${this.manifestPath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(this.manifest, null, 2))
    await fs.rename(tmpPath, this.manifestPath)
  }

  private async scanPhotosDir(): Promise<SourceFile[]> {
    const results: SourceFile[] = []
    await this.walk('', results)
    return results
  }

  private async walk(relDir: string, results: SourceFile[]): Promise<void> {
    const currentDir = path.join(this.options.photosDir, relDir)
    const entries = await fs.readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const entryRelPath = path.join(relDir, entry.name)
      if (entry.isDirectory()) {
        await this.walk(entryRelPath, results)
        continue
      }
      if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue
      }
      const stat = await fs.stat(
        path.join(this.options.photosDir, entryRelPath)
      )
      results.push({
        relPath: entryRelPath.split(path.sep).join('/'),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      })
    }
  }
}
