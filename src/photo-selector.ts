/**
 * PhotoSelector が選択できる候補の最低条件
 */
export interface SelectableItem {
  id: string
}

interface RecentSelection {
  id: string
  timestamp: number
}

/**
 * PhotoSelector の構築オプション
 */
export interface PhotoSelectorOptions {
  dedupeWindowMs: number
  randomFn?: () => number
}

/**
 * 候補からランダムに1件選択する。直近 dedupeWindowMs 以内にそのクライアントへ
 * 配信済みの候補は除外するが、除外の結果候補が0件になる場合は重複を許容する
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
   * candidates からランダムに1件選び、選択履歴に記録する
   *
   * @param candidates 選択候補の一覧
   * @param clientKey クライアントを識別するキー(通常はリクエスト元 IP)
   * @param now 現在時刻(エポックミリ秒)
   * @returns 選択された候補。candidates が空の場合は null
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
