import { describe, expect, it } from 'vitest';
import { INSPECTION_NOTES_MAX_LENGTH, inspectionFormSchema } from './inspection-input.js';

describe('inspectionFormSchema', () => {
  it('accepts a result with trimmed notes', () => {
    expect(
      inspectionFormSchema.parse({ result: 'VIOLATION', notes: '  Szczupak 40 cm  ' }),
    ).toEqual({ result: 'VIOLATION', notes: 'Szczupak 40 cm' });
  });

  it('turns blank notes into no notes', () => {
    expect(inspectionFormSchema.parse({ result: 'OK', notes: '   ' })).toEqual({
      result: 'OK',
      notes: null,
    });
  });

  it('requires the result to be chosen', () => {
    expect(inspectionFormSchema.safeParse({ result: '', notes: '' }).success).toBe(false);
    expect(inspectionFormSchema.safeParse({ notes: '' }).success).toBe(false);
  });

  it('rejects notes over the limit after trimming', () => {
    const atLimit = 'a'.repeat(INSPECTION_NOTES_MAX_LENGTH);
    expect(inspectionFormSchema.safeParse({ result: 'OK', notes: ` ${atLimit} ` }).success).toBe(
      true,
    );
    expect(inspectionFormSchema.safeParse({ result: 'OK', notes: `${atLimit}a` }).success).toBe(
      false,
    );
  });
});
