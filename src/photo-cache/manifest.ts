import { PhotoFormat } from './process.js'

/**
 * One cached photo as stored in manifest.json.
 */
export interface ManifestEntry {
  hash: string
  cacheFileName: string
  format: PhotoFormat
  width: number
  height: number
}

/**
 * The whole manifest, keyed by path relative to photos/ (POSIX separators).
 */
export type Manifest = Record<string, ManifestEntry>

/**
 * An unprocessed source file found by scanning photos/.
 */
export interface SourceFile {
  relPath: string
  size: number
  mtimeMs: number
}

/**
 * Result of comparing a scan with the manifest.
 */
export interface ManifestDiff {
  toProcess: SourceFile[]
  toRemove: string[]
}

/**
 * Computes the change-detection hash string from a source file's size and mtimeMs.
 *
 * @param size File size in bytes
 * @param mtimeMs Last modified time in epoch milliseconds
 * @returns Hash string used to detect changes
 */
export function computeSourceHash(size: number, mtimeMs: number): string {
  return `${size}-${Math.round(mtimeMs)}`
}

/**
 * Compares the current photos/ scan with the manifest to find files that need
 * (re)processing and manifest entries that should be removed.
 *
 * @param sourceFiles Files currently in photos/
 * @param manifest The manifest as of the previous scan
 * @returns Files to process and entries to remove
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
 * Checks whether an unvalidated value (e.g. parsed manifest.json) has the shape of a Manifest.
 *
 * @param value Value to check
 * @returns true if value is a well-formed Manifest
 */
export function isValidManifest(value: unknown): value is Manifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every((entry) => isManifestEntry(entry))
}
