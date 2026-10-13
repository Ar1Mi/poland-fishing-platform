import { ClockService } from './clock.service';

describe('ClockService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the current system time', () => {
    jest.useFakeTimers({ now: new Date('2026-03-29T00:30:00.000Z') });

    expect(new ClockService().now().toISOString()).toBe('2026-03-29T00:30:00.000Z');
  });
});
