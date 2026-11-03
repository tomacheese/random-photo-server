/**
 * Minimum shape of a candidate that PhotoSelector can pick.
 */
export interface SelectableItem {
  id: string
}

interface RecentSelection {
  id: string
  timestamp: number
}

/**
 * Options for PhotoSelector.
 */
export interface PhotoSelectorOptions {
  dedupeWindowMs: number
  randomFn?: () => number
}

/**
 * Picks one candidate at random. Candidates already served to the same client
 * within the last dedupeWindowMs are excluded, unless that would leave no
 * candidates, in which case repeats are allowed.
 */
export class PhotoSelector {
  private readonly dedupeWindowMs: number
  private readonly randomFn: () => number
  private readonly recentByClient = new Map<string, RecentSelection[]>()

  constructor(options: PhotoSelectorOptions) {
    this.dedupeWindowMs = options.dedupeWindowMs
    this.randomFn = options.randomFn ?? Math.random
  }

  /**
   * Picks one candidate at random and records it in the client's history.
   *
   * @param candidates Candidates to choose from
   * @param clientKey Key identifying the client (normally the request IP)
   * @param now Current time in epoch milliseconds
   * @returns The picked candidate, or null if candidates is empty
   */
  pick<T extends SelectableItem>(
    candidates: T[],
    clientKey: string,
    now: number
  ): T | null {
    if (candidates.length === 0) {
      return null
    }

    const recent = this.pruneRecent(clientKey, now)
    const recentIds = new Set(recent.map((entry) => entry.id))
    const filtered = candidates.filter((item) => !recentIds.has(item.id))
    const pool = filtered.length > 0 ? filtered : candidates

    const index = Math.min(
      Math.floor(this.randomFn() * pool.length),
      pool.length - 1
    )
    const picked = pool[index]

    // Replace rather than append: a repeat pick must not create a second
    // entry for the same id, or `recent` grows unbounded within the window
    const withoutPicked = recent.filter((entry) => entry.id !== picked.id)
    withoutPicked.push({ id: picked.id, timestamp: now })
    this.recentByClient.set(clientKey, withoutPicked)

    return picked
  }

  private pruneRecent(clientKey: string, now: number): RecentSelection[] {
    const existing = this.recentByClient.get(clientKey) ?? []
    return existing.filter(
      (entry) => now - entry.timestamp < this.dedupeWindowMs
    )
  }
}
