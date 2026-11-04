/**
 * Photo orientation. Near-square aspect ratios are 'square'.
 */
export type PhotoOrientation = 'portrait' | 'landscape' | 'square'

const SQUARE_ASPECT_RATIO_MIN = 0.95
const SQUARE_ASPECT_RATIO_MAX = 1.05

/**
 * Determines orientation from width and height.
 * An aspect ratio (width / height) within the square range is 'square'.
 *
 * @param width Width in px
 * @param height Height in px
 * @returns The detected orientation
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
