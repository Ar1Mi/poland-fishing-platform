import type { Locale, OrgRole } from '@lowisko/shared';

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

interface InvitationMail {
  organizationName: string;
  role: OrgRole;
  link: string;
  validDays: number;
}

const ROLE_NAME: Readonly<Record<Locale, Readonly<Record<OrgRole, string>>>> = {
  pl: { ORG_ADMIN: 'administrator organizacji', INSPECTOR: 'strażnik (kontroler)' },
  en: { ORG_ADMIN: 'organization admin', INSPECTOR: 'inspector' },
  ru: { ORG_ADMIN: 'администратор организации', INSPECTOR: 'инспектор' },
};

/**
 * An invitation goes to an address that may have no account yet: no first name. The link works
 * only for an account with this address (FR-04).
 */
export const invitationTemplate: Readonly<Record<Locale, (params: InvitationMail) => MailContent>> =
  {
    pl: ({ organizationName, role, link, validDays }) => ({
      subject: `Zaproszenie do organizacji ${organizationName} — Łowisko`,
      text: `Dzień dobry,\n\norganizacja ${organizationName} zaprasza Cię do serwisu Łowisko jako: ${ROLE_NAME.pl[role]}.\n\nAby przyjąć zaproszenie, otwórz link (ważny ${validDays} dni) i zaloguj się na konto z tym adresem e-mail — jeśli go nie masz, najpierw je załóż:\n${link}\n\nJeśli nie spodziewasz się zaproszenia, zignoruj tę wiadomość.`,
    }),
    en: ({ organizationName, role, link, validDays }) => ({
      subject: `Invitation to ${organizationName} — Łowisko`,
      text: `Hello,\n\n${organizationName} invites you to Łowisko as: ${ROLE_NAME.en[role]}.\n\nTo accept, open this link (valid for ${validDays} days) and log in to the account with this email address — create one first if you have none:\n${link}\n\nIf you did not expect an invitation, ignore this message.`,
    }),
    ru: ({ organizationName, role, link, validDays }) => ({
      subject: `Приглашение в организацию ${organizationName} — Łowisko`,
      text: `Здравствуйте!\n\nОрганизация ${organizationName} приглашает вас в Łowisko: ${ROLE_NAME.ru[role]}.\n\nЧтобы принять приглашение, откройте ссылку (действует ${validDays} дней) и войдите в аккаунт с этим адресом e-mail — если аккаунта нет, сначала зарегистрируйтесь:\n${link}\n\nЕсли вы не ждали приглашения, проигнорируйте письмо.`,
    }),
  };
