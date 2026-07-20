import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('ENV', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('falls back to documented defaults when no environment variables are set', async () => {
    process.env = {}

    const { ENV } = await import('./environments.js')

    expect(ENV).toEqual({
      API_HOST: '0.0.0.0',
      API_PORT: '80',
      PHOTOS_DIR: '/photos',
      CACHE_DIR: '/data/cache',
      MAX_EDGE_PX: '2048',
      OUTPUT_FORMAT: 'jpeg',
      JPEG_QUALITY: '82',
      DEDUPE_WINDOW_SEC: '60',
    })
  })

  it('uses the value from process.env when set', async () => {
    process.env.API_PORT = '3000'
    process.env.MAX_EDGE_PX = '1024'

    const { ENV } = await import('./environments.js')

    expect(ENV.API_PORT).toBe('3000')
    expect(ENV.MAX_EDGE_PX).toBe('1024')
    expect(ENV.API_HOST).toBe('0.0.0.0')
  })
})
