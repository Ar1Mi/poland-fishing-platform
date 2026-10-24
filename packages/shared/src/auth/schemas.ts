import { z } from 'zod';
import { Locale } from '../enums.js';

// Account forms (FR-01, FR-02). The API validates the same limits with class-validator DTOs.

/** Length only, no composition rules (NIST SP 800-63B); the upper bound limits hashing work. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 100;
export const ANGLER_CARD_NO_MAX_LENGTH = 50;

const email = z.string().trim().pipe(z.email());
const password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const name = z.string().trim().min(1).max(NAME_MAX_LENGTH);
const birthDate = z.iso.date();
const anglerCardNo = z.string().trim().max(ANGLER_CARD_NO_MAX_LENGTH);
const locale = z.enum(Locale);

export const registerSchema = z.object({
  email,
  password,
  firstName: name,
  lastName: name,
  birthDate,
  // Optional (RODO minimisation); an empty form field means "not given".
  anglerCardNo: anglerCardNo.optional(),
  locale: locale.optional(),
  // RODO consent: the checkbox must be ticked; registering is the record of it.
  acceptTerms: z.literal(true),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  // Any length: a password set under older limits must still be able to log in.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: z.string().min(1), password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  firstName: name.optional(),
  lastName: name.optional(),
  birthDate: birthDate.optional(),
  // null clears the card number.
  anglerCardNo: anglerCardNo.nullable().optional(),
  locale: locale.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
