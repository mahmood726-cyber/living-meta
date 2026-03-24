import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-single/**',
      'wasm/**',
      // Exclude tests using custom test runners
      'tests/tier-a/core-stats.test.js',
      'tests/tier-a/edge-cases.test.cjs',
      'tests/tier-a/memoize.test.js',
      'tests/tier-b/integration.test.cjs',
      'tests/validation/advanced-methods-validation.test.js',
      // Exclude tests with missing dependencies
      'tests/integration/ctgov-workflow.test.js'
    ],
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'dist-single/**',
        'wasm/**',
        'tests/**',
        '*.config.js',
        'scripts/**'
      ]
    },
    benchmark: {
      include: ['tests/benchmarks/**/*.test.js'],
      exclude: ['node_modules/**']
    }
  }
});
