import { WARSAW_TIME_ZONE } from '@lowisko/shared';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { RefreshTokenService } from './refresh-token.service';

/** Every night at 3:30 Warsaw time, when hardly anyone logs in. */
export const REFRESH_TOKEN_CLEANUP_CRON = '30 3 * * *';

/**
 * Deletes the refresh tokens that expired more than REFRESH_TOKEN_RETENTION_DAYS ago
 * (docs/07-security.md, T-26). One DELETE by the `expiresAt` index; several API instances
 * running it at once only delete the same rows.
 */
@Injectable()
export class RefreshTokenCleanupJob {
  constructor(
    private readonly refreshTokens: RefreshTokenService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(RefreshTokenCleanupJob.name);
  }

  @Cron(REFRESH_TOKEN_CLEANUP_CRON, {
    name: 'refresh-token-cleanup',
    timeZone: WARSAW_TIME_ZONE,
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    try {
      const deleted = await this.refreshTokens.deleteExpired();
      if (deleted > 0) {
        this.logger.info({ deleted }, 'Expired refresh tokens deleted');
      }
    } catch (err) {
      this.logger.error({ err }, 'Deleting expired refresh tokens failed');
    }
  }
}
