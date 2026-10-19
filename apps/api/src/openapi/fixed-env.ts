// Imported first by export-openapi.ts: ConfigModule decides whether to read .env when
// AppModule is loaded, so the fixed environment must be in place before that import.
// NODE_ENV is production so the document describes the production set of endpoints;
// OPENAPI_EXPORT=1 keeps .env unread. Values are placeholders: nothing connects anywhere.
Object.assign(process.env, {
  OPENAPI_EXPORT: '1',
  NODE_ENV: 'production',
  API_URL: 'http://localhost:3000',
  WEB_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://openapi@localhost:5432/openapi',
});
