import { describe, expect, it } from 'vitest'
import { PhotoSelector } from './photo-selector.js'

describe('PhotoSelector', () => {
  it('returns null when there are no candidates', () => {
    const selector = new PhotoSelector({ dedupeWindowMs: 60_000 })
    expect(selector.pick([], '127.0.0.1', 0)).toBeNull()
  })

  it('cycles through candidates before repeating, for the same client', () => {
    const selector = new PhotoSelector({
      dedupeWindowMs: 60_000,
      randomFn: () => 0,
    })
    const candidates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    expect(selector.pick(candidates, '127.0.0.1', 0)?.id).toBe('a')
    expect(selector.pick(candidates, '127.0.0.1', 1)?.id).toBe('b')
    expect(selector.pick(candidates, '127.0.0.1', 2)?.id).toBe('c')
    // all candidates are in the recent list, so a repeat is allowed
    expect(selector.pick(candidates, '127.0.0.1', 3)?.id).toBe('a')
  })

  it('allows a repeat immediately when there is only one candidate', () => {
    const selector = new PhotoSelector({
      dedupeWindowMs: 60_000,
      randomFn: () => 0,
    })
    const candidates = [{ id: 'only' }]

    expect(selector.pick(candidates, '127.0.0.1', 0)?.id).toBe('only')
    expect(selector.pick(candidates, '127.0.0.1', 1)?.id).toBe('only')
  })

  it('forgets a selection once it falls outside the dedupe window', () => {
    const selector = new PhotoSelector({
      dedupeWindowMs: 1000,
      randomFn: () => 0,
    })
    const candidates = [{ id: 'a' }, { id: 'b' }]

    expect(selector.pick(candidates, '127.0.0.1', 0)?.id).toBe('a')
    // now is past the dedupe window, so a's earlier record has expired
    // and it becomes a candidate again
    expect(selector.pick(candidates, '127.0.0.1', 2000)?.id).toBe('a')
  })

  it('tracks recent selections independently per client', () => {
    const selector = new PhotoSelector({
      dedupeWindowMs: 60_000,
      randomFn: () => 0,
    })
    const candidates = [{ id: 'a' }, { id: 'b' }]

    expect(selector.pick(candidates, '127.0.0.1', 0)?.id).toBe('a')
    // different clients do not share recent history, so 'a' may be picked again
    expect(selector.pick(candidates, '10.0.0.1', 0)?.id).toBe('a')
  })
})
