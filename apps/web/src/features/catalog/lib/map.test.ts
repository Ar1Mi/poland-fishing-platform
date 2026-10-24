import { describe, expect, it } from 'vitest';
import { bboxOf, withPosition } from './map';

describe('bboxOf', () => {
  it('orders map bounds as minLng,minLat,maxLng,maxLat', () => {
    const bounds = {
      getWest: () => 20.123456,
      getSouth: () => 52.1,
      getEast: () => 21.5,
      getNorth: () => 52.6,
    };

    expect(bboxOf(bounds)).toBe('20.12346,52.1,21.5,52.6');
  });
});

describe('withPosition', () => {
  it('keeps only waters with both coordinates', () => {
    const waters = [
      { id: 'a', lat: 52, lng: 21 },
      { id: 'b', lat: null, lng: 21 },
      { id: 'c', lat: 52, lng: null },
    ];

    expect(withPosition(waters).map((water) => water.id)).toEqual(['a']);
  });
});
