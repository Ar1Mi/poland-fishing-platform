// Fixed environment for integration tests; the real .env is never read under NODE_ENV=test.
process.env.NODE_ENV = 'test';
process.env.API_PORT = '3000';
process.env.API_URL = 'http://localhost:3000';
process.env.WEB_URL = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-bytes!';
// Never contacted: tests replace the mail transport (test/mail/fake-mail-transport.ts).
process.env.SMTP_URL = 'smtp://localhost:1025';
process.env.MAIL_FROM = 'Łowisko <no-reply@lowisko.test>';
// DATABASE_URL and TEST_DATABASE_ADMIN_URL come from the PostgreSQL container (db/global-setup.ts).
