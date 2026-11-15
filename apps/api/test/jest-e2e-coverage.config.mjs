// Coverage of the integration tests (`pnpm --filter api test:e2e:coverage`, NFR-09, T-29): the
// services of the API are tested against PostgreSQL, so their coverage comes from this run
// (their unit tests cover only pure parts).
// Same tests as jest-e2e.json, rooted at the package so that `src/` can be measured.
import e2e from './jest-e2e.json' with { type: 'json' };

/** @param {string} path */
const fromTest = (path) => path.replace('<rootDir>/', '<rootDir>/test/');

export default {
  ...e2e,
  rootDir: '..',
  roots: ['<rootDir>/test'],
  setupFiles: e2e.setupFiles.map(fromTest),
  globalSetup: fromTest(e2e.globalSetup),
  globalTeardown: fromTest(e2e.globalTeardown),
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/coverage/e2e',
  coverageReporters: ['text-summary', ['text', { skipFull: false }], 'json-summary'],
  // Business logic of the API: the services and the scheduled jobs (controllers, DTOs and
  // modules are wiring). The pure rules (CatchValidator, prices, statuses) are in
  // packages/shared and measured by its own `test:coverage`.
  collectCoverageFrom: ['src/modules/**/*.service.ts', 'src/modules/**/*.job.ts'],
  // NFR-09: at least 70 % (docs/01-requirements.md).
  coverageThreshold: { global: { statements: 70, branches: 70, functions: 70, lines: 70 } },
};
