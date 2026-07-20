import { describe, expect, it } from 'vitest'
import {
  computeSourceHash,
  diffManifest,
  isValidManifest,
  Manifest,
  SourceFile,
} from './manifest.js'

describe('computeSourceHash', () => {
  it('produces the same hash for the same size and mtimeMs', () => {
    expect(computeSourceHash(1024, 1_700_000_000_000)).toBe(
      computeSourceHash(1024, 1_700_000_000_000)
    )
  })

  it('produces a different hash when size differs', () => {
    expect(computeSourceHash(1024, 1_700_000_000_000)).not.toBe(
      computeSourceHash(2048, 1_700_000_000_000)
    )
  })

  it('produces a different hash when mtimeMs differs', () => {
    expect(computeSourceHash(1024, 1_700_000_000_000)).not.toBe(
      computeSourceHash(1024, 1_700_000_001_000)
    )
  })
})

describe('diffManifest', () => {
  it('marks a file not present in the manifest as toProcess', () => {
    const sourceFiles: SourceFile[] = [
      { relPath: 'a.png', size: 100, mtimeMs: 1000 },
    ]
    const manifest: Manifest = {}

    const { toProcess, toRemove } = diffManifest(sourceFiles, manifest)

    expect(toProcess).toEqual(sourceFiles)
    expect(toRemove).toEqual([])
  })

  it('does not mark an unchanged file as toProcess', () => {
    const sourceFiles: SourceFile[] = [
      { relPath: 'a.png', size: 100, mtimeMs: 1000 },
    ]
    const manifest: Manifest = {
      'a.png': {
        hash: computeSourceHash(100, 1000),
        cacheFileName: 'abc.jpg',
        format: 'jpeg',
        width: 800,
        height: 600,
      },
    }

    const { toProcess, toRemove } = diffManifest(sourceFiles, manifest)

    expect(toProcess).toEqual([])
    expect(toRemove).toEqual([])
  })

  it('marks a changed file (different hash) as toProcess', () => {
    const sourceFiles: SourceFile[] = [
      { relPath: 'a.png', size: 200, mtimeMs: 2000 },
    ]
    const manifest: Manifest = {
      'a.png': {
        hash: computeSourceHash(100, 1000),
        cacheFileName: 'abc.jpg',
        format: 'jpeg',
        width: 800,
        height: 600,
      },
    }

    const { toProcess } = diffManifest(sourceFiles, manifest)

    expect(toProcess).toEqual(sourceFiles)
  })

  it('marks a manifest entry with no matching source file as toRemove', () => {
    const sourceFiles: SourceFile[] = []
    const manifest: Manifest = {
      'deleted.png': {
        hash: computeSourceHash(100, 1000),
        cacheFileName: 'abc.jpg',
        format: 'jpeg',
        width: 800,
        height: 600,
      },
    }

    const { toProcess, toRemove } = diffManifest(sourceFiles, manifest)

    expect(toProcess).toEqual([])
    expect(toRemove).toEqual(['deleted.png'])
  })
})

describe('isValidManifest', () => {
  it('accepts an empty manifest', () => {
    expect(isValidManifest({})).toBe(true)
  })

  it('accepts a manifest with well-formed entries', () => {
    const manifest: Manifest = {
      'a.png': {
        hash: computeSourceHash(100, 1000),
        cacheFileName: 'abc.jpg',
        format: 'jpeg',
        width: 800,
        height: 600,
      },
    }
    expect(isValidManifest(manifest)).toBe(true)
  })

  it('rejects non-object values', () => {
    expect(isValidManifest(null)).toBe(false)
    expect(isValidManifest('not an object')).toBe(false)
    expect(isValidManifest([])).toBe(false)
  })

  it('rejects an entry missing a required field', () => {
    expect(
      isValidManifest({
        'a.png': {
          hash: 'abc',
          cacheFileName: 'abc.jpg',
          format: 'jpeg',
          width: 800,
          // height is missing
        },
      })
    ).toBe(false)
  })

  it('rejects an entry with a field of the wrong type', () => {
    expect(
      isValidManifest({
        'a.png': {
          hash: 'abc',
          cacheFileName: 'abc.jpg',
          format: 'jpeg',
          width: '800',
          height: 600,
        },
      })
    ).toBe(false)
  })

  it('rejects an entry with an unsupported format value', () => {
    expect(
      isValidManifest({
        'a.png': {
          hash: 'abc',
          cacheFileName: 'abc.jpg',
          format: 'png',
          width: 800,
          height: 600,
        },
      })
    ).toBe(false)
  })
})
