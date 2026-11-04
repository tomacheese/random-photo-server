import sharp from 'sharp'

/**
 * Servable image format. Only jpeg is currently supported.
 */
export type PhotoFormat = 'jpeg'

/**
 * Options for image resizing and compression.
 */
export interface ProcessImageOptions {
  maxEdgePx: number
  quality: number
}

/**
 * Result of image resizing and compression.
 */
export interface ProcessImageResult {
  width: number
  height: number
  format: PhotoFormat
}

/**
 * Resizes an image to fit within maxEdgePx on its long edge (never enlarging)
 * and writes it to outputPath as JPEG.
 *
 * @param inputPath Path of the source image
 * @param outputPath Path to write to
 * @param options Resize and compression options
 * @returns Width, height and format of the written image
 */
export async function processImage(
  inputPath: string,
  outputPath: string,
  options: ProcessImageOptions
): Promise<ProcessImageResult> {
  const info = await sharp(inputPath)
    .resize({
      width: options.maxEdgePx,
      height: options.maxEdgePx,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: options.quality })
    .toFile(outputPath)

  return {
    width: info.width,
    height: info.height,
    format: 'jpeg',
  }
}
