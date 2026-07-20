/**
 * 画像の向き。正方形に近いアスペクト比の場合は 'square' とする
 */
export type PhotoOrientation = 'portrait' | 'landscape' | 'square'

const SQUARE_ASPECT_RATIO_MIN = 0.95
const SQUARE_ASPECT_RATIO_MAX = 1.05

/**
 * 画像の幅・高さから向きを判定する。
 * アスペクト比(width / height)が正方形とみなせる範囲に入る場合は 'square' として扱う
 *
 * @param width 画像の幅(px)
 * @param height 画像の高さ(px)
 * @returns 判定された向き
 */
export function getPhotoOrientation(
  width: number,
  height: number
): PhotoOrientation {
  const ratio = width / height
  if (ratio >= SQUARE_ASPECT_RATIO_MIN && ratio <= SQUARE_ASPECT_RATIO_MAX) {
    return 'square'
  }
  return ratio > 1 ? 'landscape' : 'portrait'
}
