import { waterFilter } from './waters.service';

describe('waterFilter', () => {
  it('only lists published waters when no filter is given', () => {
    expect(waterFilter({})).toEqual({ isPublished: true });
  });

  it('matches the name case-insensitively', () => {
    expect(waterFilter({ q: 'zegrz' })).toMatchObject({
      name: { contains: 'zegrz', mode: 'insensitive' },
    });
  });

  it('turns a bbox into inclusive coordinate ranges', () => {
    expect(waterFilter({ bbox: { minLng: 20, minLat: 52, maxLng: 21, maxLat: 53 } })).toMatchObject(
      {
        lng: { gte: 20, lte: 21 },
        lat: { gte: 52, lte: 53 },
      },
    );
  });

  it('combines region, type and status', () => {
    expect(waterFilter({ region: 'mazowieckie', type: 'LAKE', status: 'CONNECTED' })).toEqual({
      isPublished: true,
      region: 'mazowieckie',
      type: 'LAKE',
      status: 'CONNECTED',
    });
  });

  it('escapes LIKE wildcards and the escape character', () => {
    expect(waterFilter({ q: '100%_a\\b' })).toMatchObject({
      name: { contains: '100\\%\\_a\\\\b' },
    });
  });
});
