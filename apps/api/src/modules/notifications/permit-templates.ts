import type { DateOnly, Locale } from '@lowisko/shared';
import { mailDate, mailPrice } from './mail-format';
import type { MailContent } from './templates';

// Emails about the angler's platform permit (FR-21, T-25): bought, about to expire, revoked by
// the organization. Each names the permit fully, since a season may bring several, and links
// to its page, where the QR code and the PDF are.

/** What every permit email says about the permit. */
export interface PermitMail {
  firstName: string;
  number: string;
  typeName: string;
  organizationName: string;
  waterNames: readonly string[];
  validFrom: DateOnly;
  validTo: DateOnly;
  /** The permit page `/me/permits/:id`. */
  link: string;
}

export interface PermitPurchasedMail extends PermitMail {
  pricePaidGrosze: number;
}

export interface PermitRevokedMail extends PermitMail {
  reason: string;
  /** Where the angler asks about the revocation and a refund (made outside the platform). */
  organizationEmail: string;
}

type PermitTemplate<T> = Readonly<Record<Locale, (params: T) => MailContent>>;

export const permitPurchasedTemplate: PermitTemplate<PermitPurchasedMail> = {
  pl: (p) => ({
    subject: `Zezwolenie ${p.number} — potwierdzenie zakupu — Łowisko`,
    text: `Cześć ${p.firstName},\n\ndziękujemy za zakup zezwolenia w serwisie Łowisko.\n\nNumer: ${p.number}\nRodzaj: ${p.typeName} (${p.organizationName})\nŁowiska: ${p.waterNames.join(', ')}\nWażne: od ${mailDate('pl', p.validFrom)} do ${mailDate('pl', p.validTo)} włącznie\n${p.pricePaidGrosze === 0 ? 'Opłata: bezpłatne' : `Zapłacono: ${mailPrice('pl', p.pricePaidGrosze)}`}\n\nKod QR do kontroli i zezwolenie w PDF znajdziesz po zalogowaniu na stronie zezwolenia:\n${p.link}`,
  }),
  en: (p) => ({
    subject: `Permit ${p.number} — purchase confirmation — Łowisko`,
    text: `Hi ${p.firstName},\n\nthank you for buying a permit on Łowisko.\n\nNumber: ${p.number}\nType: ${p.typeName} (${p.organizationName})\nWaters: ${p.waterNames.join(', ')}\nValid: from ${mailDate('en', p.validFrom)} to ${mailDate('en', p.validTo)} inclusive\n${p.pricePaidGrosze === 0 ? 'Fee: free' : `Paid: ${mailPrice('en', p.pricePaidGrosze)}`}\n\nThe QR code for inspections and the permit as a PDF are on the permit page once you log in:\n${p.link}`,
  }),
  ru: (p) => ({
    subject: `Разрешение ${p.number} — подтверждение покупки — Łowisko`,
    text: `Здравствуйте, ${p.firstName}!\n\nСпасибо за покупку разрешения в Łowisko.\n\nНомер: ${p.number}\nТип: ${p.typeName} (${p.organizationName})\nВодоёмы: ${p.waterNames.join(', ')}\nДействует: с ${mailDate('ru', p.validFrom)} по ${mailDate('ru', p.validTo)} включительно\n${p.pricePaidGrosze === 0 ? 'Оплата: бесплатно' : `Оплачено: ${mailPrice('ru', p.pricePaidGrosze)}`}\n\nQR-код для проверки и разрешение в PDF — на странице разрешения после входа:\n${p.link}`,
  }),
};

/**
 * Sent from three days before the last day; a late one (the API was down) still names the last
 * day, never "in three days" (docs/02-business-rules.md).
 */
export const permitExpiryReminderTemplate: PermitTemplate<PermitMail> = {
  pl: (p) => ({
    subject: `Zezwolenie ${p.number} wkrótce wygaśnie — Łowisko`,
    text: `Cześć ${p.firstName},\n\nTwoje zezwolenie ${p.number} (${p.typeName}, ${p.organizationName}) jest ważne do ${mailDate('pl', p.validTo)} włącznie.\nŁowiska: ${p.waterNames.join(', ')}\n\nJeśli chcesz łowić dalej, kup nowe zezwolenie w serwisie Łowisko. Szczegóły obecnego zezwolenia:\n${p.link}`,
  }),
  en: (p) => ({
    subject: `Permit ${p.number} expires soon — Łowisko`,
    text: `Hi ${p.firstName},\n\nyour permit ${p.number} (${p.typeName}, ${p.organizationName}) is valid until ${mailDate('en', p.validTo)} inclusive.\nWaters: ${p.waterNames.join(', ')}\n\nTo keep fishing, buy a new permit on Łowisko. Details of the current permit:\n${p.link}`,
  }),
  ru: (p) => ({
    subject: `Разрешение ${p.number} скоро истекает — Łowisko`,
    text: `Здравствуйте, ${p.firstName}!\n\nВаше разрешение ${p.number} (${p.typeName}, ${p.organizationName}) действует по ${mailDate('ru', p.validTo)} включительно.\nВодоёмы: ${p.waterNames.join(', ')}\n\nЧтобы ловить дальше, купите новое разрешение в Łowisko. Подробности текущего разрешения:\n${p.link}`,
  }),
};

/** The organization's reason as it wrote it, and its address for questions and a refund. */
export const permitRevokedTemplate: PermitTemplate<PermitRevokedMail> = {
  pl: (p) => ({
    subject: `Zezwolenie ${p.number} zostało unieważnione — Łowisko`,
    text: `Cześć ${p.firstName},\n\norganizacja ${p.organizationName} unieważniła Twoje zezwolenie ${p.number} (${p.typeName}, ważne od ${mailDate('pl', p.validFrom)} do ${mailDate('pl', p.validTo)}).\n\nPowód: ${p.reason}\n\nUnieważnione zezwolenie nie uprawnia do połowu, a połowów na nim nie można już zapisać w rejestrze. W sprawie unieważnienia i ewentualnego zwrotu opłaty skontaktuj się z organizacją: ${p.organizationEmail}\n\nSzczegóły zezwolenia:\n${p.link}`,
  }),
  en: (p) => ({
    subject: `Permit ${p.number} has been revoked — Łowisko`,
    text: `Hi ${p.firstName},\n\n${p.organizationName} has revoked your permit ${p.number} (${p.typeName}, valid from ${mailDate('en', p.validFrom)} to ${mailDate('en', p.validTo)}).\n\nReason: ${p.reason}\n\nA revoked permit does not entitle you to fish, and catches can no longer be recorded on it. For questions about the revocation or a refund, contact the organization: ${p.organizationEmail}\n\nPermit details:\n${p.link}`,
  }),
  ru: (p) => ({
    subject: `Разрешение ${p.number} аннулировано — Łowisko`,
    text: `Здравствуйте, ${p.firstName}!\n\nОрганизация ${p.organizationName} аннулировала ваше разрешение ${p.number} (${p.typeName}, действует с ${mailDate('ru', p.validFrom)} по ${mailDate('ru', p.validTo)}).\n\nПричина: ${p.reason}\n\nАннулированное разрешение не даёт права на ловлю, и уловы на нём больше нельзя записать в реестр. По вопросам аннулирования и возможного возврата оплаты обращайтесь в организацию: ${p.organizationEmail}\n\nПодробности разрешения:\n${p.link}`,
  }),
};
