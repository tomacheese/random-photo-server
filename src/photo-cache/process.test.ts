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

  describe('EXIF orientation', () => {
    async function writeOrientedJpeg(
      filePath: string,
      orientation: number
    ): Promise<void> {
      await sharp({
        create: {
          width: 40,
          height: 20,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .composite([
          {
            input: {
              create: {
                width: 20,
                height: 20,
                channels: 3,
                background: { r: 0, g: 0, b: 255 },
              },
            },
            left: 20,
            top: 0,
          },
        ])
        .jpeg({ quality: 100 })
        .withMetadata({ orientation })
        .toFile(filePath)
    }

    it.each([
      [1, 40, 20],
      [2, 40, 20],
      [3, 40, 20],
      [4, 40, 20],
      [5, 20, 40],
      [6, 20, 40],
      [7, 20, 40],
      [8, 20, 40],
    ])(
      'orientation %i yields %ix%i with no orientation tag',
      async (orientation, width, height) => {
        const inputPath = path.join(tmpDir, 'oriented.jpg')
        const outputPath = path.join(tmpDir, 'oriented-output.jpg')
        await writeOrientedJpeg(inputPath, orientation)
        const inputMeta = await sharp(inputPath).metadata()
        expect(inputMeta.orientation).toBe(orientation)

        const result = await processImage(inputPath, outputPath, {
          maxEdgePx: 2048,
          quality: 82,
        })

        expect(result.width).toBe(width)
        expect(result.height).toBe(height)
        const outputMeta = await sharp(outputPath).metadata()
        expect(outputMeta.width).toBe(width)
        expect(outputMeta.height).toBe(height)
        expect(outputMeta.orientation).toBeUndefined()
      }
    )

    it('rotates orientation 6 so the source left half ends up on top', async () => {
      const inputPath = path.join(tmpDir, 'rotated.jpg')
      const outputPath = path.join(tmpDir, 'rotated-output.jpg')
      await writeOrientedJpeg(inputPath, 6)

      await processImage(inputPath, outputPath, {
        maxEdgePx: 2048,
        quality: 82,
      })

      const { data, info } = await sharp(outputPath)
        .raw()
        .toBuffer({ resolveWithObject: true })
      const pixelAt = (x: number, y: number): number[] => {
        const offset = (y * info.width + x) * info.channels
        return [data[offset], data[offset + 1], data[offset + 2]]
      }
      const [topR, topG, topB] = pixelAt(10, 5)
      const [bottomR, bottomG, bottomB] = pixelAt(10, 35)

      expect(topR).toBeGreaterThan(200)
      expect(topG).toBeLessThan(50)
      expect(topB).toBeLessThan(50)
      expect(bottomR).toBeLessThan(50)
      expect(bottomG).toBeLessThan(50)
      expect(bottomB).toBeGreaterThan(200)
    })
  })
})
