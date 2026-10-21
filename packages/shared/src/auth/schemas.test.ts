import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from './schemas.js';

const valid = {
  email: '  jan@example.test ',
  password: 'correct horse',
  firstName: 'Jan',
  lastName: 'Kowalski',
  birthDate: '1990-05-01',
  acceptTerms: true,
} as const;

describe('registerSchema', () => {
  it('accepts a complete registration and trims the email', () => {
    expect(registerSchema.parse(valid).email).toBe('jan@example.test');
  });

  it('requires the privacy policy consent', () => {
    expect(registerSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, acceptTerms: undefined }).success).toBe(false);
  });

  it.each([
    ['too short', 'x'.repeat(PASSWORD_MIN_LENGTH - 1), false],
    ['minimum length', 'x'.repeat(PASSWORD_MIN_LENGTH), true],
    ['maximum length', 'x'.repeat(PASSWORD_MAX_LENGTH), true],
    ['too long', 'x'.repeat(PASSWORD_MAX_LENGTH + 1), false],
  ])('checks password length: %s', (_case, password, ok) => {
    expect(registerSchema.safeParse({ ...valid, password }).success).toBe(ok);
  });

  it.each(['not-an-email', '', 'jan@'])('rejects email %j', (email) => {
    expect(registerSchema.safeParse({ ...valid, email }).success).toBe(false);
  });

  it.each(['1990-13-01', '01.05.1990', '1990-02-30'])('rejects birth date %j', (birthDate) => {
    expect(registerSchema.safeParse({ ...valid, birthDate }).success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(registerSchema.safeParse({ ...valid, firstName: '   ' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a password shorter than the registration minimum', () => {
    expect(loginSchema.safeParse({ email: 'jan@example.test', password: 'short' }).success).toBe(
      true,
    );
  });
});

describe('updateProfileSchema', () => {
  it('accepts a partial update and null to clear the angler card', () => {
    expect(updateProfileSchema.parse({ anglerCardNo: null, locale: 'en' })).toEqual({
      anglerCardNo: null,
      locale: 'en',
    });
  });

  it('rejects an unknown locale', () => {
    expect(updateProfileSchema.safeParse({ locale: 'de' }).success).toBe(false);
  });
});
