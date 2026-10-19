import { ErrorCode } from '@lowisko/shared';
import { describe, expect, it } from 'vitest';
import { ClientErrorCode } from '../api/errors';
import { resources } from './i18n';

/** Dotted paths of all leaf strings, e.g. `common.app.name`. */
function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const pl = resources.pl.translation;

describe('translations', () => {
  it.each([...Object.values(ErrorCode), ...Object.values(ClientErrorCode)])(
    'has a Polish message for error code %s',
    (code) => {
      expect(pl.errors[code]).toEqual(expect.any(String));
      expect(pl.errors[code].trim()).not.toBe('');
    },
  );

  it.each(['en', 'ru'] as const)('has no %s key that is missing in pl', (lng) => {
    const plKeys = new Set(keys(pl));

    expect(keys(resources[lng].translation).filter((key) => !plKeys.has(key))).toEqual([]);
  });
});
