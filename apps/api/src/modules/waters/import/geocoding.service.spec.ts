import { normalizeQuery } from './geocoding.service';

describe('normalizeQuery', () => {
  it('ignores case, surrounding spaces and repeated whitespace', () => {
    expect(normalizeQuery('  Zalew   Zegrzyński,\tMAZOWIECKIE ')).toBe(
      'zalew zegrzyński, mazowieckie',
    );
  });

  it('keeps Polish letters and punctuation', () => {
    expect(normalizeQuery('Łódź, ul. Żeromskiego')).toBe('łódź, ul. żeromskiego');
  });
});
