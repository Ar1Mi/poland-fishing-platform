// NIP — Polish tax identification number: 10 digits, the last one a checksum.

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7] as const;

/** Drops the separators people type (`526-025-02-74`, `526 025 02 74`); stored form is digits only. */
export function normalizeNip(nip: string): string {
  return nip.replace(/[\s-]/g, '');
}

/** Ten digits (after normalizeNip) with a valid checksum; a sum ≡ 10 (mod 11) is never issued. */
export function isValidNip(nip: string): boolean {
  const digits = normalizeNip(nip);
  if (!/^\d{10}$/.test(digits)) {
    return false;
  }
  const sum = NIP_WEIGHTS.reduce((acc, weight, i) => acc + weight * Number(digits[i]), 0);
  return sum % 11 === Number(digits[9]);
}
