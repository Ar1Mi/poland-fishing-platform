import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // `test:coverage`: the fishing rules and the CatchValidator must stay ≥ 90 % covered (T-17).
    coverage: {
      provider: 'v8',
      include: ['src/rules/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.fixture.ts'],
      // Fully covered files are listed too: the table is the evidence of the criterion.
      reporter: [['text', { skipFull: false }]],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
