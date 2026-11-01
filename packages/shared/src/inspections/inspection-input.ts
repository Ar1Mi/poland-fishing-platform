import { z } from 'zod';
import { InspectionResult } from '../enums.js';

// The inspection protocol (FR-18) as the API and the protocol form accept it.

/** Notes of one protocol; the API checks the same limit with class-validator. */
export const INSPECTION_NOTES_MAX_LENGTH = 2000;

/**
 * The protocol form: the result must be chosen, never defaulted; blank notes are no notes.
 * The permit and the position are not typed in — they come from the check and the device.
 */
export const inspectionFormSchema = z.object({
  result: z.enum(InspectionResult),
  notes: z
    .string()
    .trim()
    .max(INSPECTION_NOTES_MAX_LENGTH)
    .transform((text) => (text === '' ? null : text)),
});
export type InspectionFormValues = z.input<typeof inspectionFormSchema>;
export type InspectionFormOutput = z.output<typeof inspectionFormSchema>;
