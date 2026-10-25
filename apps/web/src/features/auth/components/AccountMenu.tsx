import { Building2, LogOut, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/button';
import { useLogout, useMe, useSessionStatus } from '../api/useAuth';

const iconLink =
  'flex size-11 items-center justify-center rounded-md hover:bg-primary focus-visible:outline-primary-foreground [&_svg]:size-5';

/**
 * Header part: login link for guests; for a logged-in user the name, the organization and
 * admin sections and logout.
 */
export function AccountMenu() {
  const { t } = useTranslation();
  const status = useSessionStatus();
  const me = useMe();
  const logout = useLogout();

  if (status === 'restoring') {
    return null;
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
      <Link
        to="/org"
        className={iconLink}
        aria-label={t('auth.account.organizations')}
        title={t('auth.account.organizations')}
      >
        <Building2 aria-hidden />
      </Link>
      {me.data?.isSuperAdmin && (
        <Link
          to="/admin/claims"
          className={iconLink}
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
        onClick={() => logout.mutate()}
        aria-label={t('auth.account.logout')}
        title={t('auth.account.logout')}
      >
        <LogOut aria-hidden />
      </Button>
    </div>
  );
}
