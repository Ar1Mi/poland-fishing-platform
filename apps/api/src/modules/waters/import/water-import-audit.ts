import { createHash } from 'node:crypto';
import type { AuditEntry } from '../../audit/audit.service';
import type { WaterImportReport } from './water-import.service';

/** Failed rows kept in the AuditLog entry; the rest is only counted (a file has up to 5000). */
export const IMPORT_AUDIT_FAILED_ROWS_MAX = 100;
/** The file name is the client's: kept, but not at any length. */
const FILE_NAME_MAX_LENGTH = 255;

export interface ImportedFile {
  buffer: Buffer;
  originalname?: string;
}

/**
 * `WATERS_IMPORTED` of `POST /admin/waters/import` (T-26): which file — its name, size and
 * SHA-256, also the entity id, so the imports of one file are found together — and the report.
 */
export function waterImportAuditEntry(
  file: ImportedFile,
  report: WaterImportReport,
): Omit<AuditEntry, 'actorId'> {
  const sha256 = createHash('sha256').update(file.buffer).digest('hex');
  return {
    action: 'WATERS_IMPORTED',
    entity: 'WaterImport',
    entityId: sha256,
    diff: {
      fileName: file.originalname?.slice(0, FILE_NAME_MAX_LENGTH) ?? null,
      sizeBytes: file.buffer.length,
      created: report.created,
      updated: report.updated,
      failedCount: report.failed.length,
      failed: report.failed.slice(0, IMPORT_AUDIT_FAILED_ROWS_MAX),
    },
  };
}
