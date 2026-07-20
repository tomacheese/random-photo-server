import baseConfig from '@book000/eslint-config'

export default [
  ...baseConfig,
  {
    // vitest.config.ts is the test-runner config file and sits outside
    // tsconfig.json's rootDir (src/), so exclude it from type-aware linting
    ignores: ['vitest.config.ts'],
  },
]
