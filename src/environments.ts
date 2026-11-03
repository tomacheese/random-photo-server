const defaultEnvironment = {
  API_HOST: '0.0.0.0',
  API_PORT: '80',
  PHOTOS_DIR: '/photos',
  CACHE_DIR: '/data/cache',
  MAX_EDGE_PX: '2048',
  OUTPUT_FORMAT: 'jpeg',
  JPEG_QUALITY: '82',
  DEDUPE_WINDOW_SEC: '60',
  BUCKET_WIDTH_SEC: '180',
  RESCAN_INTERVAL_SEC: '300',
}

type EnvironmentName = keyof typeof defaultEnvironment
const environmentNames = Object.keys(defaultEnvironment) as EnvironmentName[]

/**
 * 環境変数を一元管理するオブジェクト。process.env に値がなければ既定値を使う
 */
export const ENV = Object.fromEntries(
  environmentNames.map((name) => [
    name,
    process.env[name] ?? defaultEnvironment[name],
  ])
) as Record<EnvironmentName, string>

// setInterval fires about every 1 ms when given more than 2^31-1 ms
const MAX_RESCAN_INTERVAL_SEC = 2_147_483

/**
 * RESCAN_INTERVAL_SEC の値を検証して秒数に変換する
 * @param value - 環境変数の文字列。先頭ゼロ・符号・小数を含まない 10 進整数であること
 * @returns 再走査間隔(秒)。0 は定期再走査の無効を表す
 * @throws 0 以上 2147483 以下の整数表記でない場合
 */
export function parseRescanIntervalSec(value: string): number {
  const seconds = Number.parseInt(value, 10)
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    seconds > MAX_RESCAN_INTERVAL_SEC ||
    String(seconds) !== value
  ) {
    throw new Error(
      `Invalid RESCAN_INTERVAL_SEC: "${value}" (must be an integer between 0 and ${MAX_RESCAN_INTERVAL_SEC})`
    )
  }
  return seconds
}
