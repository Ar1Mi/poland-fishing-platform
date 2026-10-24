import { validateEnv } from './env';

const valid = {
  NODE_ENV: 'production',
  API_PORT: '8080',
  API_URL: 'https://api.lowisko.example',
  WEB_URL: 'https://lowisko.example',
  DATABASE_URL: 'postgresql://lowisko:secret@db:5432/lowisko',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  SMTP_URL: 'smtp://mail:1025',
  MAIL_FROM: 'Łowisko <no-reply@lowisko.example>',
};

describe('validateEnv', () => {
  it('parses a valid environment and coerces the port to a number', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      API_PORT: 8080,
      NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
    });
  });

  it('keeps NOMINATIM_USER_AGENT optional so the API starts without geocoding', () => {
    const env = validateEnv({ ...valid, NOMINATIM_USER_AGENT: 'lowisko/1.0 (admin@example.test)' });

    expect(env.NOMINATIM_USER_AGENT).toBe('lowisko/1.0 (admin@example.test)');
    expect(validateEnv(valid).NOMINATIM_USER_AGENT).toBeUndefined();
  });

  it('applies defaults for NODE_ENV and API_PORT', () => {
    const env = validateEnv({ ...valid, NODE_ENV: undefined, API_PORT: undefined });

    expect(env.NODE_ENV).toBe('production');
    expect(env.API_PORT).toBe(3000);
  });

  it('strips the trailing slash so WEB_URL matches the browser Origin header', () => {
    expect(validateEnv({ ...valid, WEB_URL: 'https://lowisko.example/' }).WEB_URL).toBe(
      'https://lowisko.example',
    );
  });

  it('ignores variables that are not part of the schema', () => {
    expect(validateEnv({ ...valid, PATH: '/usr/bin' })).not.toHaveProperty('PATH');
  });

  it.each([
    ['missing WEB_URL', { ...valid, WEB_URL: undefined }, 'WEB_URL'],
    ['WEB_URL that is not a URL', { ...valid, WEB_URL: 'localhost' }, 'WEB_URL'],
    ['WEB_URL with a path', { ...valid, WEB_URL: 'https://lowisko.example/app' }, 'WEB_URL'],
    ['WEB_URL with a query', { ...valid, WEB_URL: 'https://lowisko.example?x=1' }, 'WEB_URL'],
    ['non-http API_URL', { ...valid, API_URL: 'ftp://api.lowisko.example' }, 'API_URL'],
    ['non-numeric API_PORT', { ...valid, API_PORT: 'abc' }, 'API_PORT'],
    ['API_PORT out of range', { ...valid, API_PORT: '70000' }, 'API_PORT'],
    ['missing DATABASE_URL', { ...valid, DATABASE_URL: undefined }, 'DATABASE_URL'],
    ['non-postgres DATABASE_URL', { ...valid, DATABASE_URL: 'mysql://db/lowisko' }, 'DATABASE_URL'],
    [
      'JWT_ACCESS_SECRET under 32 bytes',
      { ...valid, JWT_ACCESS_SECRET: 'a'.repeat(31) },
      'JWT_ACCESS_SECRET',
    ],
    ['missing JWT_ACCESS_SECRET', { ...valid, JWT_ACCESS_SECRET: undefined }, 'JWT_ACCESS_SECRET'],
    ['non-smtp SMTP_URL', { ...valid, SMTP_URL: 'http://mail:1025' }, 'SMTP_URL'],
    ['empty MAIL_FROM', { ...valid, MAIL_FROM: '' }, 'MAIL_FROM'],
    ['non-http NOMINATIM_URL', { ...valid, NOMINATIM_URL: 'nominatim' }, 'NOMINATIM_URL'],
    ['unknown NODE_ENV', { ...valid, NODE_ENV: 'staging' }, 'NODE_ENV'],
  ])('rejects %s and names the variable', (_name, raw, variable) => {
    expect(() => validateEnv(raw)).toThrow(variable);
  });
});
