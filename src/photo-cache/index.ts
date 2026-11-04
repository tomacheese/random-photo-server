import { createHash } from 'node:crypto'
import { promises as fs, Stats } from 'node:fs'
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
 * One servable cached photo.
 */
export interface CachedEntry {
  relPath: string
  cacheFileName: string
  format: PhotoFormat
  width: number
  height: number
}

/**
 * Options for PhotoCache.
 */
export interface PhotoCacheOptions {
  photosDir: string
  cacheDir: string
  maxEdgePx: number
  jpegQuality: number
  /** Interval (ms) for periodically rescanning photos/. No periodic rescan if omitted or 0 */
  rescanIntervalMs?: number
}

interface ReconcileResult {
  changed: boolean
  processed: number
  removed: number
}

/**
 * Keeps resized, compressed copies of photos/ in cacheDir and updates them
 * incrementally as photos/ changes.
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
  private rescanQueued = false
  private rescanTimer: NodeJS.Timeout | null = null

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
   * Scans photos/ and brings cacheDir up to date with the manifest.
   * Must complete once before serving starts.
   */
  async init(): Promise<void> {
    await fs.mkdir(this.options.cacheDir, { recursive: true })
    this.manifest = await this.loadManifest()

    await this.reconcile()

    await this.saveManifest()
    this.ready = true
    this.logger.info(
      `✅ Initial scan complete: ${Object.keys(this.manifest).length} photos cached`
    )
  }

  /**
   * Scans photos/ and applies the diff against the manifest to the cache.
   * A scan failure is thrown as is (the manifest is left unchanged).
   * If processing after the scan fails, the changes made so far are saved before rethrowing.
   * @returns Whether anything changed, plus the counts of added or updated and removed photos
   */
  private async reconcile(): Promise<ReconcileResult> {
    const sourceFiles = await this.scanPhotosDir()
    const { toProcess, toRemove } = diffManifest(sourceFiles, this.manifest)

    let processed = 0
    let removed = 0
    try {
      for (const file of toProcess) {
        if (await this.processAndRecord(file)) {
          processed++
        }
      }
      for (const relPath of toRemove) {
        await this.removeEntry(relPath)
        removed++
      }
    } catch (error) {
      try {
        await this.saveManifest()
      } catch (saveError) {
        this.logger.error(
          '❌ Failed to save manifest after rescan failure',
          saveError as Error
        )
      }
      throw error
    }
    return { changed: processed > 0 || removed > 0, processed, removed }
  }

  /**
   * Rescans photos/ and applies additions, changes and removals to the cache.
   * Meant for environments where filesystem events never arrive (e.g. network mounts).
   * Runs serialized with watcher event handling. Failures are only logged, never rejected.
   * Does nothing if a rescan is already queued.
   */
  async rescan(): Promise<void> {
    if (this.rescanQueued) {
      return
    }
    this.rescanQueued = true
    this.enqueueEvent(async () => {
      this.rescanQueued = false
      try {
        const { changed, processed, removed } = await this.reconcile()
        if (!changed) {
          return
        }
        await this.saveManifest()
        this.logger.info(
          `🔄 Rescan applied changes: ${processed} added or updated, ${removed} removed`
        )
      } catch (error) {
        this.logger.error('❌ Failed to rescan photos', error as Error)
      }
    })
    await this.eventChain
  }

  /**
   * Watches photos/ for additions, changes and removals, and cacheDir for
   * external deletions, updating the cache incrementally.
   * Also starts periodic rescans when `rescanIntervalMs` is positive.
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

    const { rescanIntervalMs } = this.options
    if (rescanIntervalMs !== undefined && rescanIntervalMs > 0) {
      this.rescanTimer = setInterval(() => {
        this.rescan().catch((error: unknown) => {
          this.logger.error('❌ Unexpected rescan failure', error as Error)
        })
      }, rescanIntervalMs)
      this.rescanTimer.unref()
    }
  }

  /**
   * Stops file watching and periodic rescans. Does not wait for a running rescan to finish.
   */
  async close(): Promise<void> {
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }
    await this.watcher?.close()
    await this.cacheWatcher?.close()
  }

  private enqueueEvent(task: () => Promise<void>): void {
    this.eventChain = this.eventChain.then(task).catch((error: unknown) => {
      this.logger.error('❌ Failed to process watcher event', error as Error)
    })
  }

  /**
   * Whether the initial scan has completed.
   */
  isReady(): boolean {
    return this.ready
  }

  getCount(): number {
    return Object.keys(this.manifest).length
  }

  /**
   * Path of the cache directory.
   */
  getCacheDir(): string {
    return this.options.cacheDir
  }

  /**
   * Cached photos that can currently be served.
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

  /**
   * When a cache file in cacheDir is deleted externally, regenerates it if the
   * source photo still exists, otherwise drops the manifest entry.
   * @param filePath Path of the deleted cache file
   */
  private async handleCacheFileRemoved(filePath: string): Promise<void> {
    const cacheFileName = path.basename(filePath)
    if (cacheFileName === path.basename(this.manifestPath)) {
      return
    }
    // This process only deletes cache files together with their manifest
    // entry, so an event with no matching entry is not an external deletion
    const relPath = Object.keys(this.manifest).find(
      (key) => this.manifest[key].cacheFileName === cacheFileName
    )
    if (relPath === undefined) {
      return
    }
    // The file name is derived from relPath, so a late event may refer to a
    // file already regenerated by a later add/change event
    if (await this.pathExists(filePath)) {
      return
    }

    let sourceStat: Stats
    try {
      sourceStat = await fs.stat(path.join(this.options.photosDir, relPath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error(
          `❌ Failed to stat source photo: ${relPath}`,
          error as Error
        )
      }
      await this.dropEntry(relPath)
      this.logger.info(
        `🗑️ Cache file removed externally, dropped manifest entry: ${relPath}`
      )
      return
    }

    const regenerated = await this.processAndRecord({
      relPath,
      size: sourceStat.size,
      mtimeMs: sourceStat.mtimeMs,
    })
    if (!regenerated) {
      await this.dropEntry(relPath)
      return
    }
    await this.saveManifest()
    this.logger.info(
      `♻️ Cache file removed externally, regenerated: ${relPath}`
    )
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.stat(targetPath)
      return true
    } catch {
      return false
    }
  }

  private async dropEntry(relPath: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.manifest[relPath]
    await this.saveManifest()
  }

  private toRelPath(filePath: string): string {
    return path
      .relative(this.options.photosDir, filePath)
      .split(path.sep)
      .join('/')
  }

  /**
   * Processes one photo and records it in the manifest.
   * @param file Source file to process
   * @returns true on success, false on failure
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
