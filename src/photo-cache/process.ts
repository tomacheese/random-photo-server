import sharp from 'sharp'

/**
 * 配信可能な画像フォーマット。現状は jpeg のみ対応
 */
export type PhotoFormat = 'jpeg'

/**
 * 画像リサイズ・圧縮のオプション
 */
export interface ProcessImageOptions {
  maxEdgePx: number
  quality: number
}

/**
 * 画像リサイズ・圧縮の結果
 */
export interface ProcessImageResult {
  width: number
  height: number
  format: PhotoFormat
}

/**
 * 画像を長辺 maxEdgePx に収まるようリサイズ(拡大はしない)し、
 * JPEG として outputPath に書き出す
 *
 * @param inputPath 元画像のパス
 * @param outputPath 書き出し先のパス
 * @param options リサイズ・圧縮のオプション
 * @returns 書き出した画像の幅・高さ・フォーマット
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
