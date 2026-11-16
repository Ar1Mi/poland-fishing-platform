import { describe, expect, it } from 'vitest';
import { OSM_ATTRIBUTION, OSM_TILE_URL, tileOrigin, tileSource } from './map-tiles';

const MAPTILER =
  'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=public-browser-key';

describe('tileSource', () => {
  it('falls back to OSM with its attribution when nothing is set', () => {
    expect(tileSource({})).toEqual({ url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION });
    expect(tileSource({ VITE_MAP_TILE_URL: ' ', VITE_MAP_TILE_ATTRIBUTION: '' })).toEqual({
      url: OSM_TILE_URL,
      attribution: OSM_ATTRIBUTION,
    });
  });

  it('takes the configured provider and its attribution', () => {
    expect(
      tileSource({ VITE_MAP_TILE_URL: MAPTILER, VITE_MAP_TILE_ATTRIBUTION: '&copy; MapTiler' }),
    ).toEqual({ url: MAPTILER, attribution: '&copy; MapTiler' });
  });

  it('refuses another provider without its attribution', () => {
    expect(() => tileSource({ VITE_MAP_TILE_URL: MAPTILER })).toThrow('VITE_MAP_TILE_ATTRIBUTION');
  });

  it('refuses a template it could not allow in the CSP', () => {
    expect(() =>
      tileSource({
        VITE_MAP_TILE_URL: 'https://{s}.tile.example/{z}/{x}/{y}.png',
        VITE_MAP_TILE_ATTRIBUTION: 'x',
      }),
    ).toThrow('VITE_MAP_TILE_URL');
    expect(() =>
      tileSource({
        VITE_MAP_TILE_URL: 'http://tiles.example/{z}/{x}/{y}.png',
        VITE_MAP_TILE_ATTRIBUTION: 'x',
      }),
    ).toThrow('VITE_MAP_TILE_URL');
  });
});

describe('tileOrigin', () => {
  it('is the scheme and host of the template', () => {
    expect(tileOrigin(OSM_TILE_URL)).toBe('https://tile.openstreetmap.org');
    expect(tileOrigin(MAPTILER)).toBe('https://api.maptiler.com');
    expect(tileOrigin('https://tiles.example/{z}/{x}/{y}{r}.png')).toBe('https://tiles.example');
  });
});
