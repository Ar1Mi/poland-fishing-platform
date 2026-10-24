import { ErrorCode } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';
import { PrismaService } from '../../../database/prisma.service';
import { GeocoderUnavailableError } from './geocoder';
import { GeocodingService, type Position } from './geocoding.service';
import {
  parseWaterCsv,
  validateWaterRow,
  type WaterCsvRow,
  WaterCsvFormatError,
} from './water-csv';

/**
 * After this many geocoder failures in a row the import stops asking it: with Nominatim
 * down every row would wait for the timeout. Cached queries still resolve.
 */
export const GEOCODER_FAILURES_TO_STOP = 3;

export interface WaterImportReport {
  created: number;
  updated: number;
  failed: { row: number; error: string }[];
}

/**
 * Catalogue import from CSV (FR-22). Upsert by `source + sourceRef`: a repeated import
 * updates the catalogue fields and never touches what the platform owns (status,
 * organization, description, publication). A bad row lands in `failed`, the rest go on.
 */
@Injectable()
export class WaterImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
  ) {}

  /** Throws VALIDATION_FAILED when the file as a whole is unusable. */
  async import(content: Buffer | string): Promise<WaterImportReport> {
    let records;
    try {
      records = parseWaterCsv(content);
    } catch (error) {
      if (error instanceof WaterCsvFormatError) {
        throw new DomainError(ErrorCode.VALIDATION_FAILED, { file: error.message }, error.message);
      }
      throw error;
    }

    const report: WaterImportReport = { created: 0, updated: 0, failed: [] };
    const fail = (row: number, error: string) => report.failed.push({ row, error });
    const firstRowOfKey = new Map<string, number>();
    const geocoder = { failuresInRow: 0 };

    // One row at a time: geocoding is limited to 1 request/s anyway.
    for (const record of records) {
      if ('error' in record) {
        fail(record.row, record.error);
        continue;
      }
      const validated = validateWaterRow(record.values);
      if ('error' in validated) {
        fail(record.row, validated.error);
        continue;
      }
      const { row } = validated;
      const key = `${row.source}:${row.sourceRef}`;
      const earlier = firstRowOfKey.get(key);
      if (earlier !== undefined) {
        fail(record.row, `source+sourceRef already used in row ${earlier}`);
        continue;
      }
      firstRowOfKey.set(key, record.row);

      const position = await this.resolvePosition(row, geocoder);
      if ('error' in position) {
        fail(record.row, position.error);
        continue;
      }
      const created = await this.upsert(row, position);
      report[created ? 'created' : 'updated'] += 1;
    }
    return report;
  }

  private async resolvePosition(
    row: WaterCsvRow,
    geocoder: { failuresInRow: number },
  ): Promise<Position | { error: string }> {
    if (!('geocodeQuery' in row.position)) {
      return row.position;
    }
    const query = row.position.geocodeQuery;
    try {
      // Once stopped, the geocoder stays off for the rest of the file.
      const stopped = geocoder.failuresInRow >= GEOCODER_FAILURES_TO_STOP;
      const position = await this.geocoding.locate(query, { cachedOnly: stopped });
      if (!stopped) {
        geocoder.failuresInRow = 0;
      }
      return position ?? { error: `geocodeQuery: no place found for "${query}"` };
    } catch (error) {
      if (error instanceof GeocoderUnavailableError) {
        geocoder.failuresInRow += 1;
        return { error: `geocodeQuery: ${error.message}` };
      }
      throw error;
    }
  }

  /** true when the water is new. */
  private async upsert(row: WaterCsvRow, { lat, lng }: Position): Promise<boolean> {
    const where = { source_sourceRef: { source: row.source, sourceRef: row.sourceRef } };
    const fields = {
      name: row.name,
      type: row.type,
      region: row.region,
      externalOwnerName: row.externalOwnerName,
      externalInfoUrl: row.externalInfoUrl,
      lat,
      lng,
    };
    const existing = await this.prisma.fishingWater.findUnique({ where, select: { id: true } });
    await this.prisma.fishingWater.upsert({
      where,
      create: { ...fields, source: row.source, sourceRef: row.sourceRef },
      update: fields,
    });
    return !existing;
  }
}
