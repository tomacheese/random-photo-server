/**
 * Returns the bucket number for the current time, floored to bucketWidthSeconds.
 *
 * @param nowMs Current time in epoch milliseconds
 * @param bucketWidthSeconds Bucket width in seconds
 */
export function getBucketIndex(
  nowMs: number,
  bucketWidthSeconds: number
): number {
  return Math.floor(nowMs / 1000 / bucketWidthSeconds)
}

/**
 * Deterministically picks one candidate from the (bucketIndex, photoframeId)
 * pair. The same pair and candidate list always yield the same candidate.
 *
 * @param candidates Candidates to choose from
 * @param bucketIndex Bucket number
 * @param photoframeId Non-negative integer identifying the photo frame
 * @returns The picked candidate, or null if candidates is empty
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
