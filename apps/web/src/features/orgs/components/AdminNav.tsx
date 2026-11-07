import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { cn } from '../../../shared/lib/cn';

/** Sections of the super admin: organizations to activate and water claims to decide. */
export function AdminNav() {
  const { t } = useTranslation();
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-11 items-center rounded-md px-3 font-semibold',
      isActive ? 'bg-secondary text-primary' : 'text-primary underline',
    );
  return (
    <nav aria-label={t('orgs.adminNav.label')} className="flex flex-wrap gap-2">
      <NavLink to="/admin/orgs" className={link}>
        {t('orgs.adminNav.orgs')}
      </NavLink>
      <NavLink to="/admin/claims" className={link}>
        {t('orgs.adminNav.claims')}
      </NavLink>
    </nav>
  );
}
