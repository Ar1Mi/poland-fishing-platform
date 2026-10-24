import { describe, expect, it } from 'vitest';
import { formatBbox, isInBbox, isRegion, parseBbox, POLAND_BOUNDS, REGIONS } from './catalog.js';

describe('REGIONS', () => {
  it('lists the 16 voivodeships', () => {
    expect(REGIONS).toHaveLength(16);
    expect(new Set(REGIONS).size).toBe(16);
  });

  it('recognises a stored region and rejects anything else', () => {
    expect(isRegion('mazowieckie')).toBe(true);
    expect(isRegion('Mazowieckie')).toBe(false);
    expect(isRegion('mazowsze')).toBe(false);
    expect(isRegion(undefined)).toBe(false);
  });
});

describe('parseBbox', () => {
  it('parses minLng,minLat,maxLng,maxLat', () => {
    expect(parseBbox('20.5,52,21.25,52.5')).toEqual({
      minLng: 20.5,
      minLat: 52,
      maxLng: 21.25,
      maxLat: 52.5,
    });
  });

  it('accepts negative coordinates and spaces around numbers', () => {
    expect(parseBbox('-10, -5.5, 0, 0')).toEqual({
      minLng: -10,
      minLat: -5.5,
      maxLng: 0,
      maxLat: 0,
    });
  });

  it('accepts a point (min equals max)', () => {
    expect(parseBbox('21,52,21,52')).not.toBeNull();
  });

  it.each([
    ['three numbers', '20,52,21'],
    ['five numbers', '20,52,21,53,1'],
    ['an empty part', '20,,21,53'],
    ['not a number', '20,52,abc,53'],
    ['exponent notation', '2e1,52,21,53'],
    ['Infinity', '20,52,Infinity,53'],
    ['longitude out of range', '-181,52,21,53'],
    ['latitude out of range', '20,52,21,90.5'],
    ['min longitude above max', '22,52,21,53'],
    ['min latitude above max', '20,54,21,53'],
  ])('rejects %s', (_name, value) => {
    expect(parseBbox(value)).toBeNull();
  });
});

describe('formatBbox', () => {
  it('rounds to 5 decimals', () => {
    expect(formatBbox({ minLng: 20.123456, minLat: 52.000004, maxLng: 21, maxLat: 52.5 })).toBe(
      '20.12346,52,21,52.5',
    );
  });

  it('clamps a viewport larger than the world', () => {
    expect(formatBbox({ minLng: -200, minLat: -95, maxLng: 250, maxLat: 91 })).toBe(
      '-180,-90,180,90',
    );
  });

  it('produces what parseBbox accepts', () => {
    const box = { minLng: 14.1, minLat: 49, maxLng: 24.15, maxLat: 54.84 };

    expect(parseBbox(formatBbox(box))).toEqual(box);
  });
});

describe('isInBbox', () => {
  it('accepts points inside Poland, edges included', () => {
    expect(isInBbox(52.23, 21.01, POLAND_BOUNDS)).toBe(true);
    expect(isInBbox(49.0, 14.07, POLAND_BOUNDS)).toBe(true);
    expect(isInBbox(54.84, 24.15, POLAND_BOUNDS)).toBe(true);
  });

  it('rejects swapped coordinates and points abroad', () => {
    expect(isInBbox(21.01, 52.23, POLAND_BOUNDS)).toBe(false);
    expect(isInBbox(52.52, 13.4, POLAND_BOUNDS)).toBe(false);
  });
});
