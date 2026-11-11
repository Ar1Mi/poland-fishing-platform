import { Fish, Map as MapIcon, Ticket, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { cn } from '../shared/lib/cn';

/**
 * `BottomNav` of the angler on a phone (docs/10-design-system.md): the active section has the
 * Toń 100 fill and dark text, not only a coloured icon. Four sections; «Profil» (T-26) leads to
 * the profile and the RODO rights.
 */
export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={t('common.nav.label')}
      className="fixed inset-x-0 bottom-0 z-[1100] border-t border-border bg-card px-2 pt-1.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4 gap-1">
        <Item to="/" end icon={<MapIcon aria-hidden />}>
          {t('common.nav.waters')}
        </Item>
        <Item to="/me/permits" icon={<Ticket aria-hidden />}>
          {t('common.nav.permits')}
        </Item>
        {/* Recording a catch belongs to the register: both keep «Połowy» active. */}
        <Item to="/me/catches" active={pathname === '/catch/new'} icon={<Fish aria-hidden />}>
          {t('common.nav.catches')}
        </Item>
        <Item to="/me/profile" icon={<UserRound aria-hidden />}>
          {t('common.nav.profile')}
        </Item>
      </ul>
    </nav>
  );
}

function Item({
  to,
  end = false,
  active = false,
  icon,
  children,
}: {
  to: string;
  end?: boolean;
  /** Also current on another path (`aria-current`, the fill). */
  active?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const current = active || (end ? pathname === to : pathname.startsWith(to));
  return (
    <li>
      <Link
        to={to}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex h-13 flex-col items-center justify-center gap-0.5 rounded-md text-label font-semibold text-muted-foreground [&_svg]:size-5.5',
          current && 'bg-secondary text-primary-dark',
        )}
      >
        {icon}
        {children}
      </Link>
    </li>
  );
}
