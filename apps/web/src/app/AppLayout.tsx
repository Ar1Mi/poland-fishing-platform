import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Mobile-first shell: header with the app name and language, content with 16 px margins. */
export function AppLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-md focus:bg-card focus:p-3"
      >
        {t('common.app.skipToContent')}
      </a>
      <header className="bg-primary-dark text-primary-foreground">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <Link to="/" className="text-h2 focus-visible:outline-primary-foreground">
            {t('common.app.name')}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 p-4">
        <Outlet />
      </main>
    </div>
  );
}
