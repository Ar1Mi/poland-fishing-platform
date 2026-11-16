// Imported first by trust-proxy.e2e-spec.ts: ConfigModule validates the environment when
// AppModule is loaded, so the variable must be set before that import (each test file has
// its own module registry and environment copy).
process.env.TRUST_PROXY = '1';
