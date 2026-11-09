import { Test, type TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { schedulingImports } from '../../../common/scheduling/scheduling';
import { PermitExpiryReminderJob } from './permit-expiry-reminder.job';
import { PermitMailsService, type ReminderRun } from './permit-mails.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('PermitExpiryReminderJob', () => {
  let moduleRef: TestingModule | undefined;

  const setup = async (
    nodeEnv: string,
    sendDue: () => Promise<ReminderRun> = () => Promise.resolve({ sent: 0, failed: 0 }),
  ) => {
    const mails = { sendDueExpiryReminders: jest.fn(sendDue) };
    const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    moduleRef = await Test.createTestingModule({
      imports: schedulingImports({ NODE_ENV: nodeEnv }),
      providers: [
        PermitExpiryReminderJob,
        { provide: PermitMailsService, useValue: mails },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();
    return { job: moduleRef.get(PermitExpiryReminderJob), mails, logger };
  };

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
    jest.useRealTimers();
  });

  it('runs at 8:00 Warsaw time in winter (7:00 UTC), not before', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-07T06:58:00.000Z') });
    const { mails } = await setup('production');
    await moduleRef!.init();

    await jest.advanceTimersByTimeAsync(MINUTE);
    expect(mails.sendDueExpiryReminders).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2 * MINUTE);
    expect(mails.sendDueExpiryReminders).toHaveBeenCalledTimes(1);
  });

  it('runs at 8:00 Warsaw time in summer (6:00 UTC)', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-01T05:59:00.000Z') });
    const { mails } = await setup('production');
    await moduleRef!.init();

    await jest.advanceTimersByTimeAsync(2 * MINUTE);

    expect(mails.sendDueExpiryReminders).toHaveBeenCalledTimes(1);
  });

  it('runs every hour through 20:00 and not at night', async () => {
    // 7:30 Warsaw time (CET) to 7:30 the next day: 8:00, 9:00, …, 20:00.
    jest.useFakeTimers({ now: new Date('2026-11-07T06:30:00.000Z') });
    const { mails } = await setup('production');
    await moduleRef!.init();

    await jest.advanceTimersByTimeAsync(24 * HOUR);

    expect(mails.sendDueExpiryReminders).toHaveBeenCalledTimes(13);
  });

  it('runs on the day the clocks move forward', async () => {
    // 29 March 2026: 2:00 CET becomes 3:00 CEST; 8:00 Warsaw is 6:00 UTC that day.
    jest.useFakeTimers({ now: new Date('2026-03-29T05:59:00.000Z') });
    const { mails } = await setup('production');
    await moduleRef!.init();

    await jest.advanceTimersByTimeAsync(2 * MINUTE);

    expect(mails.sendDueExpiryReminders).toHaveBeenCalledTimes(1);
  });

  it('leaves the reminders to the tests themselves under NODE_ENV=test', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-07T06:30:00.000Z') });
    const { mails } = await setup('test');
    await moduleRef!.init();

    await jest.advanceTimersByTimeAsync(24 * HOUR);

    expect(mails.sendDueExpiryReminders).not.toHaveBeenCalled();
  });

  it('logs what it sent and what it left for the next run', async () => {
    const { job, logger } = await setup('production', () =>
      Promise.resolve({ sent: 4, failed: 2 }),
    );

    await job.run();

    expect(logger.warn).toHaveBeenCalledWith(
      { sent: 4, failed: 2 },
      'Permit expiry reminders stopped, the rest go next run',
    );
  });

  it('logs a failed run and keeps running', async () => {
    const err = new Error('database unavailable');
    const { job, logger } = await setup('production', () => Promise.reject(err));

    await expect(job.run()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith({ err }, 'Sending permit expiry reminders failed');
  });
});
