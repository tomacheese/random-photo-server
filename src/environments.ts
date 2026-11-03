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
 * Central environment configuration. Falls back to the default when process.env has no value.
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
 * Validates RESCAN_INTERVAL_SEC and converts it to seconds.
 * @param value - Raw environment value; must be a decimal integer without sign, leading zeros or fraction
 * @returns Rescan interval in seconds; 0 disables periodic rescans
 * @throws If the value is not an integer between 0 and 2147483
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
