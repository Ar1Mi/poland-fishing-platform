import { describe, expect, it } from 'vitest';
import { formatDate } from './format';

describe('formatDate', () => {
  it('uses the calendar day in Warsaw, not in UTC', () => {
    // 23:30 UTC on 24 October is already 25 October in Warsaw (CEST, UTC+2).
    expect(formatDate('2026-10-24T23:30:00Z', 'pl')).toBe('25 paź 2026');
  });

  it('handles the change to winter time', () => {
    // 25 October 2026 23:30 UTC is 00:30 on 26 October in Warsaw (CET, UTC+1).
    expect(formatDate('2026-10-25T23:30:00Z', 'en')).toBe('Oct 26, 2026');
  });
});
