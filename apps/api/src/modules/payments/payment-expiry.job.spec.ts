import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env';
import { PAYMENT_EXPIRY_INTERVAL_MS, PaymentExpiryJob } from './payment-expiry.job';
import type { PaymentsService } from './payments.service';

describe('PaymentExpiryJob', () => {
  const setup = (nodeEnv: Env['NODE_ENV'], expireAbandoned: () => Promise<number>) => {
    const payments = { expireAbandoned: jest.fn(expireAbandoned) };
    const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
    const config = { get: () => nodeEnv };
    const job = new PaymentExpiryJob(
      payments as unknown as PaymentsService,
      config as unknown as ConfigService<Env, true>,
      logger as unknown as PinoLogger,
    );
    return { job, payments, logger };
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sweeps every minute once the application has started, until it stops', async () => {
    const { job, payments } = setup('production', () => Promise.resolve(0));

    job.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(PAYMENT_EXPIRY_INTERVAL_MS * 2);
    job.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(PAYMENT_EXPIRY_INTERVAL_MS * 2);

    expect(payments.expireAbandoned).toHaveBeenCalledTimes(2);
  });

  it('leaves the sweep to the tests themselves under NODE_ENV=test', async () => {
    const { job, payments } = setup('test', () => Promise.resolve(0));

    job.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(PAYMENT_EXPIRY_INTERVAL_MS * 2);

    expect(payments.expireAbandoned).not.toHaveBeenCalled();
    job.onModuleDestroy();
  });

  it('logs how many payments it cancelled', async () => {
    const { job, logger } = setup('production', () => Promise.resolve(3));

    await job.run();

    expect(logger.info).toHaveBeenCalledWith({ cancelled: 3 }, 'Abandoned payments cancelled');
  });

  it('logs a failed sweep and keeps running', async () => {
    const err = new Error('database unavailable');
    const { job, logger } = setup('production', () => Promise.reject(err));

    await expect(job.run()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith({ err }, 'Cancelling abandoned payments failed');
  });
});
