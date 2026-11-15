import { WARSAW_TIME_ZONE } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { ClaimsService } from './claims.service';

/** Every night at 3:45 Warsaw time, after the refresh token cleanup (3:30). */
export const CLAIM_DOCUMENT_CLEANUP_CRON = '45 3 * * *';

/** Deletes the documents of long-rejected claims (CLAIM_DOCUMENT_RETENTION_DAYS, T-30). */
@Injectable()
export class ClaimDocumentCleanupJob {
  constructor(
    private readonly claims: ClaimsService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(ClaimDocumentCleanupJob.name);
  }

  @Cron(CLAIM_DOCUMENT_CLEANUP_CRON, {
    name: 'claim-document-cleanup',
    timeZone: WARSAW_TIME_ZONE,
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    try {
      const deleted = await this.claims.deleteExpiredDocuments();
      if (deleted > 0) {
        this.logger.info({ deleted }, 'Expired claim documents deleted');
      }
    } catch (err) {
      this.logger.error({ err }, 'Deleting expired claim documents failed');
    }
  }
}
