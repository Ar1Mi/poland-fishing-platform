import { describe, expect, it } from 'vitest';
import { matchesQuery } from './search';

describe('matchesQuery', () => {
  it('ignores case and Polish diacritics, ł included', () => {
    expect(matchesQuery('Zalew Zegrzyński', 'zegrzynski')).toBe(true);
    expect(matchesQuery('Staw Głęboczek', 'GLEBOCZEK')).toBe(true);
  });

  it('matches everything with a blank query and nothing unrelated', () => {
    expect(matchesQuery('Jezioro Białe', '  ')).toBe(true);
    expect(matchesQuery('Jezioro Białe', 'narew')).toBe(false);
  });
});
