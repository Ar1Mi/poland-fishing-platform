import { Locale } from '@lowisko/shared';
import { mailDate, mailPrice } from './mail-format';
import {
  permitExpiryReminderTemplate,
  permitPurchasedTemplate,
  permitRevokedTemplate,
  type PermitMail,
} from './permit-templates';

const permit: PermitMail = {
  firstName: 'Jan',
  number: 'ZW-2026-000123',
  typeName: 'Tygodniowe',
  organizationName: 'Koło PZW nr 12',
  waterNames: ['Zalew Zegrzyński', 'Narew'],
  validFrom: '2026-11-04',
  validTo: '2026-11-10',
  link: 'https://lowisko.test/me/permits/0b0f7c8e-1111-4c1e-9d4c-2a3b4c5d6e7f',
};

describe('mailDate and mailPrice', () => {
  it('write a calendar day in the recipient’s language, whatever the zone', () => {
    expect(mailDate('pl', '2026-11-10')).toBe('10 listopada 2026');
    expect(mailDate('en', '2026-11-10')).toBe('10 November 2026');
    expect(mailDate('ru', '2026-11-10')).toBe('10 ноября 2026 г.');
    // The first and last day of a year stay where they are.
    expect(mailDate('pl', '2027-01-01')).toBe('1 stycznia 2027');
    expect(mailDate('en', '2026-12-31')).toBe('31 December 2026');
  });

  it('write grosze as złoty, the amount and currency kept on one line', () => {
    // Intl joins them with a no-break space.
    expect(mailPrice('pl', 2500)).toBe('25,00 zł');
    expect(mailPrice('en', 2599)).toBe('PLN 25.99');
    expect(mailPrice('ru', 5)).toBe('0,05 PLN');
  });
});

describe.each(Object.values(Locale))('permit emails in %s', (locale) => {
  it('confirm a purchase with the dates, waters, price and the permit page', () => {
    const { subject, text } = permitPurchasedTemplate[locale]({ ...permit, pricePaidGrosze: 9900 });

    expect(subject).toContain(permit.number);
    for (const part of [
      permit.firstName,
      permit.typeName,
      permit.organizationName,
      'Zalew Zegrzyński, Narew',
      mailDate(locale, permit.validFrom),
      mailDate(locale, permit.validTo),
      mailPrice(locale, 9900),
      permit.link,
    ]) {
      expect(text).toContain(part);
    }
  });

  it('call a free permit free instead of showing a price of zero', () => {
    const { text } = permitPurchasedTemplate[locale]({ ...permit, pricePaidGrosze: 0 });

    expect(text).not.toContain(mailPrice(locale, 0));
  });

  it('remind of the last day, not of a number of days left', () => {
    const { subject, text } = permitExpiryReminderTemplate[locale](permit);

    expect(subject).toContain(permit.number);
    expect(text).toContain(mailDate(locale, permit.validTo));
    expect(text).toContain(permit.link);
    expect(text).not.toMatch(/\b3\b/);
  });

  it('tell why the organization revoked the permit and whom to ask', () => {
    const { subject, text } = permitRevokedTemplate[locale]({
      ...permit,
      reason: 'Zwrot przelewem 12.11 — łowisko zamknięte',
      organizationEmail: 'kolo12@pzw.example',
    });

    expect(subject).toContain(permit.number);
    for (const part of [
      permit.organizationName,
      'Zwrot przelewem 12.11 — łowisko zamknięte',
      'kolo12@pzw.example',
      permit.link,
    ]) {
      expect(text).toContain(part);
    }
  });
});
