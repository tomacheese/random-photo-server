/**
 * 現在時刻(エポックミリ秒)を bucketWidthSeconds 単位で切り捨てたバケット番号を求める
 *
 * @param nowMs 現在時刻(エポックミリ秒)
 * @param bucketWidthSeconds バケット幅(秒)
 * @returns バケット番号
 */
export function getBucketIndex(nowMs: number, bucketWidthSeconds: number): number {
  return Math.floor(nowMs / 1000 / bucketWidthSeconds)
}

/**
 * bucketIndex と photoframeId の組み合わせから candidates 内の1件を決定論的に選ぶ。
 * 同じ組み合わせであれば常に同じ候補を返す
 *
 * @param candidates 選択候補の一覧
 * @param bucketIndex バケット番号
 * @param photoframeId フォトフレームを識別する非負整数
 * @returns 選択された候補。candidates が空の場合は null
 */
export function pickDeterministic<T>(
  candidates: T[],
  bucketIndex: number,
  photoframeId: number
): T | null {
  if (candidates.length === 0) {
    return null
  }
  const index = (bucketIndex + photoframeId) % candidates.length
  return candidates[index]
}
