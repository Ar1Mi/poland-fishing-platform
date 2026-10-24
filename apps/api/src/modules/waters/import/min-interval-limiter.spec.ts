import { type LimiterTimers, MinIntervalLimiter } from './min-interval-limiter';

/** Virtual clock: sleeping moves time forward instead of waiting. */
function virtualTimers(start = 10_000): LimiterTimers & { sleeps: number[] } {
  let time = start;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => time,
    sleep: (ms) => {
      sleeps.push(ms);
      time += ms;
      return Promise.resolve();
    },
  };
}

describe('MinIntervalLimiter', () => {
  it('runs the first task at once', async () => {
    const timers = virtualTimers();
    const limiter = new MinIntervalLimiter(1000, timers);

    await expect(limiter.schedule(() => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(timers.sleeps).toEqual([]);
  });

  it('keeps at least the interval between starts of concurrent tasks', async () => {
    const timers = virtualTimers();
    const limiter = new MinIntervalLimiter(1000, timers);
    const starts: number[] = [];
    const task = () => {
      starts.push(timers.now());
      return Promise.resolve();
    };

    await Promise.all([limiter.schedule(task), limiter.schedule(task), limiter.schedule(task)]);

    expect(starts).toEqual([10_000, 11_000, 12_000]);
  });

  it('waits only the rest of the interval when time has already passed', async () => {
    const timers = virtualTimers();
    const limiter = new MinIntervalLimiter(1000, timers);

    await limiter.schedule(() => timers.sleep(300));
    await limiter.schedule(() => Promise.resolve());

    expect(timers.sleeps).toEqual([300, 700]);
  });

  it('continues with the next task after a failed one', async () => {
    const limiter = new MinIntervalLimiter(1000, virtualTimers());

    const failed = limiter.schedule(() => Promise.reject(new Error('boom')));
    const next = limiter.schedule(() => Promise.resolve('next'));

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('next');
  });
});
