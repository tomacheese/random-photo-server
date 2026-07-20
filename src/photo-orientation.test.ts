import { describe, expect, it } from 'vitest'
import { getPhotoOrientation } from './photo-orientation.js'

describe('getPhotoOrientation', () => {
  it('classifies a clearly wider image as landscape', () => {
    expect(getPhotoOrientation(1600, 900)).toBe('landscape')
  })

  it('classifies a clearly taller image as portrait', () => {
    expect(getPhotoOrientation(900, 1600)).toBe('portrait')
  })

  it('classifies an exact square as square', () => {
    expect(getPhotoOrientation(1000, 1000)).toBe('square')
  })

  it('classifies a ratio at the lower square boundary (0.95) as square', () => {
    expect(getPhotoOrientation(950, 1000)).toBe('square')
  })

  it('classifies a ratio at the upper square boundary (1.05) as square', () => {
    expect(getPhotoOrientation(1050, 1000)).toBe('square')
  })

  it('classifies a ratio just below the square lower boundary as portrait', () => {
    expect(getPhotoOrientation(949, 1000)).toBe('portrait')
  })

  it('classifies a ratio just above the square upper boundary as landscape', () => {
    expect(getPhotoOrientation(1051, 1000)).toBe('landscape')
  })
})
