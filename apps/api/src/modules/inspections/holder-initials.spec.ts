import { holderInitials } from './holder-initials';

describe('holderInitials', () => {
  it('shows the first letter of each name with a dot', () => {
    expect(holderInitials('Jan', 'Kowalski')).toBe('J. K.');
  });

  it('keeps Polish letters and upper-cases them', () => {
    expect(holderInitials('łukasz', 'żółć')).toBe('Ł. Ż.');
  });

  it('takes one letter of a double-barrelled name', () => {
    expect(holderInitials('Anna Maria', 'Nowak-Kowalska')).toBe('A. N.');
  });

  it('ignores surrounding spaces and does not split a surrogate pair', () => {
    expect(holderInitials('  Jan', '𝒜dam')).toBe('J. 𝒜.');
  });

  it('composes a decomposed letter before taking it', () => {
    expect(holderInitials('Jan', 'Żółć'.normalize('NFD'))).toBe('J. Ż.');
  });

  it('leaves out an empty name', () => {
    expect(holderInitials('Jan', '')).toBe('J.');
  });
});
