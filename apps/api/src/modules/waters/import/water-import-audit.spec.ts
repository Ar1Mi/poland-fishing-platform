import { createHash } from 'node:crypto';
import { IMPORT_AUDIT_FAILED_ROWS_MAX, waterImportAuditEntry } from './water-import-audit';

describe('waterImportAuditEntry', () => {
  const content = Buffer.from('source,sourceRef\nRZGW,A\n');
  const sha256 = createHash('sha256').update(content).digest('hex');

  it('names the file by its SHA-256 and keeps its name, size and the report', () => {
    const entry = waterImportAuditEntry(
      { buffer: content, originalname: 'wody-mazowsze.csv' },
      { created: 2, updated: 3, failed: [{ row: 4, error: 'region: must be a voivodeship' }] },
    );

    expect(entry).toEqual({
      action: 'WATERS_IMPORTED',
      entity: 'WaterImport',
      entityId: sha256,
      diff: {
        fileName: 'wody-mazowsze.csv',
        sizeBytes: content.length,
        created: 2,
        updated: 3,
        failedCount: 1,
        failed: [{ row: 4, error: 'region: must be a voivodeship' }],
      },
    });
  });

  it(`keeps the first ${IMPORT_AUDIT_FAILED_ROWS_MAX} failed rows and counts all of them`, () => {
    const failed = Array.from({ length: 5000 }, (_, index) => ({ row: index + 2, error: 'x' }));

    const { diff } = waterImportAuditEntry({ buffer: content }, { created: 0, updated: 0, failed });

    expect(diff).toMatchObject({ fileName: null, failedCount: 5000 });
    const kept = (diff as { failed: { row: number }[] }).failed;
    expect(kept).toHaveLength(IMPORT_AUDIT_FAILED_ROWS_MAX);
    expect(kept.at(-1)).toEqual({ row: IMPORT_AUDIT_FAILED_ROWS_MAX + 1, error: 'x' });
  });

  it('cuts a very long file name', () => {
    const { diff } = waterImportAuditEntry(
      { buffer: content, originalname: `${'a'.repeat(300)}.csv` },
      { created: 0, updated: 0, failed: [] },
    );

    expect((diff as { fileName: string }).fileName).toHaveLength(255);
  });
});
