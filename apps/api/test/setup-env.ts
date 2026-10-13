// Fixed environment for integration tests; the real .env is never read under NODE_ENV=test.
process.env.NODE_ENV = 'test';
process.env.API_PORT = '3000';
process.env.API_URL = 'http://localhost:3000';
process.env.WEB_URL = 'http://localhost:5173';
