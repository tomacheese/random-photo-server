import { describe, expect, it } from 'vitest'
import { getBucketIndex, pickDeterministic } from './deterministic-selector.js'

describe('getBucketIndex', () => {
  it('floors the epoch time to the bucket width', () => {
    expect(getBucketIndex(0, 180)).toBe(0)
    expect(getBucketIndex(179_000, 180)).toBe(0)
    expect(getBucketIndex(180_000, 180)).toBe(1)
    expect(getBucketIndex(359_999, 180)).toBe(1)
  })
})

describe('pickDeterministic', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickDeterministic([], 0, 0)).toBeNull()
  })

  it('returns the same candidate for the same bucketIndex and photoframeId', () => {
    const candidates = ['a', 'b', 'c']
    expect(pickDeterministic(candidates, 5, 2)).toBe(
      pickDeterministic(candidates, 5, 2)
    )
  })

  it('varies the pick as photoframeId increments', () => {
    const candidates = ['a', 'b', 'c']
    expect(pickDeterministic(candidates, 0, 0)).toBe('a')
    expect(pickDeterministic(candidates, 0, 1)).toBe('b')
    expect(pickDeterministic(candidates, 0, 2)).toBe('c')
    expect(pickDeterministic(candidates, 0, 3)).toBe('a')
  })

  it('varies the pick as bucketIndex advances', () => {
    const candidates = ['a', 'b', 'c']
    expect(pickDeterministic(candidates, 1, 0)).toBe('b')
    expect(pickDeterministic(candidates, 2, 0)).toBe('c')
  })
})
