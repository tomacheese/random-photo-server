import { PhotoFormat } from './process.js'

/**
 * manifest.json に保存する、キャッシュ済み画像1件分の情報
 */
export interface ManifestEntry {
  hash: string
  cacheFileName: string
  format: PhotoFormat
  width: number
  height: number
}

/**
 * photos/ からの相対パス(POSIX 区切り)をキーとした manifest 全体
 */
export type Manifest = Record<string, ManifestEntry>

/**
 * photos/ を走査して得られる、処理前の元ファイル情報
 */
export interface SourceFile {
  relPath: string
  size: number
  mtimeMs: number
}

/**
 * 差分判定の結果
 */
export interface ManifestDiff {
  toProcess: SourceFile[]
  toRemove: string[]
}

/**
 * ソースファイルの size と mtimeMs から、キャッシュ判定用のハッシュ文字列を算出する
 *
 * @param size ファイルサイズ(バイト)
 * @param mtimeMs 最終更新時刻(エポックミリ秒)
 * @returns 判定用ハッシュ文字列
 */
export function computeSourceHash(size: number, mtimeMs: number): string {
  return `${size}-${Math.round(mtimeMs)}`
}

/**
 * 現在の photos/ 走査結果と manifest を比較し、再処理が必要なファイルと
 * 削除すべき manifest エントリを求める
 *
 * @param sourceFiles 現在 photos/ に存在するファイルの一覧
 * @param manifest 直前まで保持していた manifest
 * @returns 再処理対象と削除対象の一覧
 */
export function diffManifest(
  sourceFiles: SourceFile[],
  manifest: Manifest
): ManifestDiff {
  const toProcess: SourceFile[] = []
  for (const file of sourceFiles) {
    const hash = computeSourceHash(file.size, file.mtimeMs)
    const entry = manifest[file.relPath]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,@typescript-eslint/prefer-optional-chain
    if (entry === undefined || entry.hash !== hash) {
      toProcess.push(file)
    }
  }

  const sourceRelPaths = new Set(sourceFiles.map((file) => file.relPath))
  const toRemove = Object.keys(manifest).filter(
    (relPath) => !sourceRelPaths.has(relPath)
  )

  return { toProcess, toRemove }
}

function isManifestEntry(value: unknown): value is ManifestEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Partial<ManifestEntry>
  return (
    typeof entry.hash === 'string' &&
    typeof entry.cacheFileName === 'string' &&
    entry.format === 'jpeg' &&
    typeof entry.width === 'number' &&
    typeof entry.height === 'number'
  )
}

/**
 * 未検証の値(manifest.json をパースした結果など)が Manifest として
 * 妥当な形状を持っているかどうかを判定する
 *
 * @param value 検証対象の値
 * @returns value が Manifest として妥当な形状であれば true
 */
export function isValidManifest(value: unknown): value is Manifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every((entry) => isManifestEntry(entry))
}
