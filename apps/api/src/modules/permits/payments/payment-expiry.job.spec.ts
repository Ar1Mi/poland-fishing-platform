import { Test, type TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { schedulingImports } from '../../../common/scheduling/scheduling';
import { PAYMENT_EXPIRY_INTERVAL_MS, PaymentExpiryJob } from './payment-expiry.job';
import { PaymentsService } from './payments.service';

describe('PaymentExpiryJob', () => {
  const setup = async (nodeEnv: string, expireAbandoned: () => Promise<number>) => {
    const payments = { expireAbandoned: jest.fn(expireAbandoned) };
    const logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };
    // The scheduler as the application registers it (AppModule), with the job's real decorator.
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: schedulingImports({ NODE_ENV: nodeEnv }),
      providers: [
        PaymentExpiryJob,
        { provide: PaymentsService, useValue: payments },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    return { moduleRef, job: moduleRef.get(PaymentExpiryJob), payments, logger };
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sweeps every minute once the application has started, until it stops', async () => {
    const { moduleRef, payments } = await setup('production', () => Promise.resolve(0));

    await moduleRef.init();
    await jest.advanceTimersByTimeAsync(PAYMENT_EXPIRY_INTERVAL_MS * 2);
    await moduleRef.close();
    await jest.advanceTimersByTimeAsync(PAYMENT_EXPIRY_INTERVAL_MS * 2);

    expect(payments.expireAbandoned).toHaveBeenCalledTimes(2);
  });

  it('leaves the sweep to the tests themselves under NODE_ENV=test', async () => {
    const { moduleRef, payments } = await setup('test', () => Promise.resolve(0));

    await moduleRef.init();
    await jest.advanceTimersByTimeAsync(PAYMENT_EXPIRY_INTERVAL_MS * 2);

    expect(payments.expireAbandoned).not.toHaveBeenCalled();
    await moduleRef.close();
  });

  it('logs how many payments it cancelled', async () => {
    const { job, logger } = await setup('production', () => Promise.resolve(3));

    await job.run();

    expect(logger.info).toHaveBeenCalledWith({ cancelled: 3 }, 'Abandoned payments cancelled');
  });

  it('logs a failed sweep and keeps running', async () => {
    const err = new Error('database unavailable');
    const { job, logger } = await setup('production', () => Promise.reject(err));

    await expect(job.run()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith({ err }, 'Cancelling abandoned payments failed');
  });
});
