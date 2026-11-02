import { Building2, LogOut, ShieldCheck, Ticket, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { i18n } from '../../../shared/i18n/i18n';
import { Link } from 'react-router';
import { cn } from '../../../shared/lib/cn';
import { deviceDb } from '../../../shared/offline/db';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { useLogout, useMe, useSessionStatus } from '../api/useAuth';

const iconLink =
  'flex size-11 items-center justify-center rounded-md hover:bg-primary focus-visible:outline-primary-foreground [&_svg]:size-5';

/**
 * Header part: login link for guests; for a logged-in user the name, their permits, the
 * organization and admin sections and logout. Offline only a badge says so: logging out needs
 * the server, which must forget the refresh cookie.
 */
export function AccountMenu() {
  const { t } = useTranslation();
  const status = useSessionStatus();
  const me = useMe();
  const logout = useLogout();

  if (status === 'restoring') {
    return null;
  }
  if (status === 'offline') {
    return (
      <Badge variant="warning">
        <WifiOff aria-hidden />
        {t('auth.account.offline')}
      </Badge>
    );
  }
  if (status === 'guest') {
    return (
      <Link
        to="/login"
        className="flex h-11 items-center px-2 text-body font-semibold focus-visible:outline-primary-foreground"
      >
        {t('auth.account.login')}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {me.data && (
        <span className="hidden text-body sm:inline">
          {t('auth.account.greeting', { name: me.data.firstName })}
        </span>
      )}
      {/* On a phone the bottom navigation leads to the permits. */}
      <Link
        to="/me/permits"
        className={cn(iconLink, 'hidden md:flex')}
        aria-label={t('auth.account.permits')}
        title={t('auth.account.permits')}
      >
        <Ticket aria-hidden />
      </Link>
      <Link
        to="/org"
        className={iconLink}
        aria-label={t('auth.account.organizations')}
        title={t('auth.account.organizations')}
      >
        <Building2 aria-hidden />
      </Link>
      {/* The admin panel is a desktop screen; on a 375 px phone its icon would push logout off. */}
      {me.data?.isSuperAdmin && (
        <Link
          to="/admin/claims"
          className={cn(iconLink, 'hidden sm:flex')}
          aria-label={t('auth.account.admin')}
          title={t('auth.account.admin')}
        >
          <ShieldCheck aria-hidden />
        </Link>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-11 text-primary-foreground hover:bg-primary focus-visible:outline-primary-foreground"
        disabled={logout.isPending}
        onClick={() => void confirmLogout(me.data?.id).then((go) => go && logout.mutate())}
        aria-label={t('auth.account.logout')}
        title={t('auth.account.logout')}
      >
        <LogOut aria-hidden />
      </Button>
    </div>
  );
}

/**
 * Logging out removes the user's unsent catches from the device: say how many first. They
 * exist online only when the server keeps failing; offline there is no logout.
 */
async function confirmLogout(userId: string | undefined): Promise<boolean> {
  const unsent = userId
    ? await deviceDb.catchQueue
        .where('[userId+status]')
        .equals([userId, 'PENDING_SYNC'])
        .count()
        .catch(() => 0)
    : 0;
  return unsent === 0 || window.confirm(i18n.t('auth.account.logoutUnsent', { count: unsent }));
}
