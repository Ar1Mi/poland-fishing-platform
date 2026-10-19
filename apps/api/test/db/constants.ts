/** Same major version as docker-compose.yml and production. */
export const POSTGRES_IMAGE = 'postgres:16-alpine';

/** Migrated empty database that every test database is cloned from. */
export const TEMPLATE_DATABASE = 'lowisko_template';
