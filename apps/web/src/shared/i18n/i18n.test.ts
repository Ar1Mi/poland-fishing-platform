import { ErrorCode, REGIONS } from '@lowisko/shared';
import { describe, expect, it } from 'vitest';
import { ClientErrorCode } from '../api/errors';
import { i18n, resources } from './i18n';

/** Leaf strings by dotted path, e.g. `common.app.name`. */
function leaves(tree: object, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'object' && value !== null) {
      for (const [path, text] of leaves(value as object, `${prefix}${key}.`)) {
        result.set(path, text);
      }
    } else {
      result.set(`${prefix}${key}`, String(value));
    }
  }
  return result;
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** `catalog.map.cluster_few` → `catalog.map.cluster`; other keys stay as they are. */
function baseKey(path: string): string {
  return path.replace(PLURAL_SUFFIX, '');
}

/** Base keys with the plural forms they define (empty set for a plain key). */
function keyForms(tree: object): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const path of leaves(tree).keys()) {
    const forms = result.get(baseKey(path)) ?? new Set<string>();
    const suffix = PLURAL_SUFFIX.exec(path)?.[1];
    if (suffix) forms.add(suffix);
    result.set(baseKey(path), forms);
  }
  return result;
}

/** `{{name}}` placeholders and `<1>` tags of a string, sorted. */
function tokens(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}|<\/?(\d+)>/g)].map((match) => match[0]).sort();
}

const pl = resources.pl.translation;
const LANGUAGES = ['pl', 'en', 'ru'] as const;
const TRANSLATED = ['en', 'ru'] as const;

describe('translations', () => {
  it.each([...Object.values(ErrorCode), ...Object.values(ClientErrorCode)])(
    'has a Polish message for error code %s',
    (code) => {
      expect(pl.errors[code]).toEqual(expect.any(String));
      expect(pl.errors[code].trim()).not.toBe('');
    },
  );

  it.each(TRANSLATED)('has no %s key that is missing in pl', (lng) => {
    const plKeys = new Set(leaves(pl).keys());

    expect(
      [...leaves(resources[lng].translation).keys()].filter((key) => !plKeys.has(key)),
    ).toEqual([]);
  });

  // T-31: every language is complete, so a new Polish key fails CI until it is translated.
  it.each(TRANSLATED)('translates every pl key into %s', (lng) => {
    const translated = keyForms(resources[lng].translation);

    expect([...keyForms(pl).keys()].filter((key) => !translated.has(key))).toEqual([]);
  });

  it.each(LANGUAGES)('has no empty string in %s', (lng) => {
    const empty = [...leaves(resources[lng].translation)].filter(([, text]) => text.trim() === '');

    expect(empty.map(([path]) => path)).toEqual([]);
  });

  // i18next picks `_one`, `_few`… by `Intl.PluralRules`: a missing form silently falls back to pl.
  it.each(LANGUAGES)('has exactly the %s plural forms for every counted key', (lng) => {
    const categories = new Intl.PluralRules(lng).resolvedOptions().pluralCategories.sort();
    const wrong = [...keyForms(resources[lng].translation)]
      .filter(([, forms]) => forms.size > 0)
      .filter(([, forms]) => [...forms].sort().join() !== categories.join())
      .map(([key, forms]) => `${key}: ${[...forms].sort().join()}`);

    expect(wrong).toEqual([]);
  });

  it.each(TRANSLATED)('keeps the pl placeholders and tags in %s', (lng) => {
    const plTokens = new Map(
      [...leaves(pl)].map(([path, text]) => [baseKey(path), tokens(text).join()]),
    );
    const mismatched = [...leaves(resources[lng].translation)]
      .filter(([path, text]) => tokens(text).join() !== plTokens.get(baseKey(path)))
      .map(([path]) => path);

    expect(mismatched).toEqual([]);
  });

  it.each(LANGUAGES)('names every voivodeship in %s', (lng) => {
    const regions: Record<string, string> = resources[lng].translation.catalog.region;

    expect(Object.keys(regions).sort()).toEqual([...REGIONS].sort());
  });

  // A key added to pl without a translation must still show (in Polish) until CI flags it.
  it('falls back to Polish for a key that has no translation', () => {
    expect(i18n.options.fallbackLng).toEqual(['pl']);
  });
});
