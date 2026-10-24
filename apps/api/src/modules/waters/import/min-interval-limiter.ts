export interface LimiterTimers {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realTimers: LimiterTimers = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Runs tasks one at a time with at least `intervalMs` between their starts, across all
 * callers of the instance (two imports at once still share one Nominatim budget).
 * A failed task does not break the queue.
 */
export class MinIntervalLimiter {
  private lastStart = Number.NEGATIVE_INFINITY;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly intervalMs: number,
    private readonly timers: LimiterTimers = realTimers,
  ) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const wait = this.lastStart + this.intervalMs - this.timers.now();
      if (wait > 0) {
        await this.timers.sleep(wait);
      }
      this.lastStart = this.timers.now();
      return task();
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}
