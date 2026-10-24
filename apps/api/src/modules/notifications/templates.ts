import type { Locale } from '@lowisko/shared';

// Plain-text account emails in the recipient's language. T-25 extends this to the full set
// of notifications.

export interface MailContent {
  subject: string;
  text: string;
}

interface LinkMail {
  firstName: string;
  link: string;
}

type Template = (params: LinkMail) => MailContent;

export const emailVerificationTemplate: Readonly<Record<Locale, Template>> = {
  pl: ({ firstName, link }) => ({
    subject: 'Potwierdź adres e-mail — Łowisko',
    text: `Cześć ${firstName},\n\naby aktywować konto w serwisie Łowisko, otwórz link (ważny 24 godziny):\n${link}\n\nJeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.`,
  }),
  en: ({ firstName, link }) => ({
    subject: 'Confirm your email — Łowisko',
    text: `Hi ${firstName},\n\nto activate your Łowisko account, open this link (valid for 24 hours):\n${link}\n\nIf you did not sign up, ignore this message.`,
  }),
  ru: ({ firstName, link }) => ({
    subject: 'Подтвердите адрес e-mail — Łowisko',
    text: `Здравствуйте, ${firstName}!\n\nЧтобы активировать аккаунт в Łowisko, откройте ссылку (действует 24 часа):\n${link}\n\nЕсли вы не регистрировались, просто проигнорируйте это письмо.`,
  }),
};

export const passwordResetTemplate: Readonly<Record<Locale, Template>> = {
  pl: ({ firstName, link }) => ({
    subject: 'Zmiana hasła — Łowisko',
    text: `Cześć ${firstName},\n\naby ustawić nowe hasło, otwórz link (ważny 1 godzinę):\n${link}\n\nJeśli nie prosiłeś o zmianę hasła, zignoruj tę wiadomość — obecne hasło pozostaje bez zmian.`,
  }),
  en: ({ firstName, link }) => ({
    subject: 'Reset your password — Łowisko',
    text: `Hi ${firstName},\n\nto set a new password, open this link (valid for 1 hour):\n${link}\n\nIf you did not ask for a reset, ignore this message — your password stays the same.`,
  }),
  ru: ({ firstName, link }) => ({
    subject: 'Смена пароля — Łowisko',
    text: `Здравствуйте, ${firstName}!\n\nЧтобы задать новый пароль, откройте ссылку (действует 1 час):\n${link}\n\nЕсли вы не запрашивали смену пароля, проигнорируйте письмо — текущий пароль не изменится.`,
  }),
};
