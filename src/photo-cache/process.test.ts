import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { processImage } from './process.js'

describe('processImage', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-cache-process-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('resizes a large image to fit within maxEdgePx and encodes it as jpeg', async () => {
    const inputPath = path.join(tmpDir, 'input.png')
    const outputPath = path.join(tmpDir, 'output.jpg')
    await sharp({
      create: {
        width: 4000,
        height: 2000,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    })
      .png()
      .toFile(inputPath)

    const result = await processImage(inputPath, outputPath, {
      maxEdgePx: 2048,
      quality: 82,
    })

    expect(result.format).toBe('jpeg')
    expect(result.width).toBe(2048)
    expect(result.height).toBe(1024)

    const outputMeta = await sharp(outputPath).metadata()
    expect(outputMeta.format).toBe('jpeg')
    expect(outputMeta.width).toBe(2048)
    expect(outputMeta.height).toBe(1024)
  })

  it('does not upscale an image smaller than maxEdgePx', async () => {
    const inputPath = path.join(tmpDir, 'small.png')
    const outputPath = path.join(tmpDir, 'small-output.jpg')
    await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toFile(inputPath)

    const result = await processImage(inputPath, outputPath, {
      maxEdgePx: 2048,
      quality: 82,
    })

    expect(result.width).toBe(100)
    expect(result.height).toBe(50)
  })
})
