const defaultEnvironment = {
  API_HOST: '0.0.0.0',
  API_PORT: '80',
  PHOTOS_DIR: '/photos',
  CACHE_DIR: '/data/cache',
  MAX_EDGE_PX: '2048',
  OUTPUT_FORMAT: 'jpeg',
  JPEG_QUALITY: '82',
  DEDUPE_WINDOW_SEC: '60',
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
