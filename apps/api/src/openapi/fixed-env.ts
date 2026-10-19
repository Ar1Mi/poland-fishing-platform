// Imported first by export-openapi.ts: ConfigModule decides whether to read .env when
// AppModule is loaded, so the fixed environment must be in place before that import.
Object.assign(process.env, {
  NODE_ENV: 'test',
  API_URL: 'http://localhost:3000',
  WEB_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://openapi@localhost:5432/openapi',
});
