import { CircleCheck, Info, LoaderCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Alert, AlertDescription } from '../../../shared/ui/alert';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../shared/ui/card';
import { useMyOrgs } from '../../orgs/api/useMyOrgs';
import { type OrgWater, useOrgWaters } from '../../permits/api/usePermitTypes';
import {
  type OrgRule,
  type Species,
  useDeleteRule,
  useOrgRules,
  useSpecies,
} from '../api/useRules';
import { RuleForm } from '../components/RuleForm';
import { RuleTerms, termsOf } from '../components/RuleTerms';
import { speciesName } from '../lib/format-rule';

/**
 * The organization's regulamin (FR-16): rules of the whole organization and of its waters.
 * They can only make the general rules stricter; a looser parameter is kept but marked.
 */
export function OrgRulesPage() {
  const { t } = useTranslation();
  const { orgId = '' } = useParams();
  const organization = useMyOrgs().data?.find((org) => org.id === orgId);
  const rules = useOrgRules(orgId);
  const waters = useOrgWaters(orgId);
  const species = useSpecies();
  // `new`, the id of the rule being changed, or nothing.
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queries = [rules, waters, species];
  const failed = queries.find((query) => query.isError);

  const edit = (id: string | null) => {
    setEditing(id);
    setNotice(null);
  };
  const saved = () => {
    setEditing(null);
    setNotice(t('rules.org.saved'));
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{t('rules.org.title')}</h1>
        {organization && <p className="text-muted-foreground">{organization.name}</p>}
      </div>
      <Alert variant="info">
        <Info aria-hidden />
        <AlertDescription className="text-body">{t('rules.org.lead')}</AlertDescription>
      </Alert>
      {queries.some((query) => query.isPending) && !failed && (
        <Badge variant="neutral" role="status">
          <LoaderCircle aria-hidden className="animate-spin" />
          {t('rules.org.loading')}
        </Badge>
      )}
      {/* The API decides access (ORG_SCOPE_VIOLATION, ORG_NOT_ACTIVE, FORBIDDEN). */}
      {failed && <ApiErrorAlert error={failed.error} />}
      {notice && (
        <Alert variant="success" role="status">
          <CircleCheck aria-hidden />
          <AlertDescription className="text-body">{notice}</AlertDescription>
        </Alert>
      )}
      {rules.isSuccess && waters.isSuccess && species.isSuccess && (
        <>
          {editing === 'new' ? (
            <RuleForm
              orgId={orgId}
              species={species.data}
              waters={waters.data}
              onSaved={saved}
              onCancel={() => edit(null)}
            />
          ) : (
            <Button type="button" className="w-fit" onClick={() => edit('new')}>
              <Plus aria-hidden />
              {t('rules.org.add')}
            </Button>
          )}
          <RuleList
            orgId={orgId}
            rules={rules.data}
            species={species.data}
            waters={waters.data}
            editing={editing}
            onEdit={edit}
            onSaved={saved}
            onDeleted={() => setNotice(t('rules.org.deleted'))}
          />
        </>
      )}
    </>
  );
}

function RuleList({
  orgId,
  rules,
  species,
  waters,
  editing,
  onEdit,
  onSaved,
  onDeleted,
}: {
  orgId: string;
  rules: OrgRule[];
  species: Species[];
  waters: OrgWater[];
  editing: string | null;
  onEdit: (id: string | null) => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation();
  const byId = new Map(species.map((item) => [item.id, item]));
  return (
    <Card aria-labelledby="rule-list-title">
      <CardHeader>
        <CardTitle id="rule-list-title">{t('rules.org.listTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <p className="text-body">{t('rules.org.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rules.map((rule) => {
              const item = byId.get(rule.speciesId);
              const name = item ? speciesName(item, i18n.resolvedLanguage) : '';
              return (
                <li key={rule.id} className="py-3 first:pt-0 last:pb-0">
                  {editing === rule.id ? (
                    <RuleForm
                      orgId={orgId}
                      species={species}
                      waters={waters}
                      rule={rule}
                      onSaved={onSaved}
                      onCancel={() => onEdit(null)}
                    />
                  ) : (
                    <RuleItem
                      orgId={orgId}
                      rule={rule}
                      name={name}
                      onEdit={() => onEdit(rule.id)}
                      onDeleted={onDeleted}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RuleItem({
  orgId,
  rule,
  name,
  onEdit,
  onDeleted,
}: {
  orgId: string;
  rule: OrgRule;
  name: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const remove = useDeleteRule(orgId);
  // Deleting cannot be undone: it takes a second click.
  const [confirming, setConfirming] = useState(false);
  const confirmId = `rule-${rule.id}-confirm`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <p className="text-body font-semibold">{name}</p>
        <p className="text-small text-muted-foreground">
          {rule.water ? rule.water.name : t('rules.org.wholeOrganization')}
        </p>
      </div>
      <RuleTerms rule={termsOf(rule)} ineffective={rule.ineffective} />
      {remove.isError && <ApiErrorAlert error={remove.error} />}
      {confirming ? (
        <div className="flex flex-col gap-2" role="group" aria-labelledby={confirmId}>
          <p id={confirmId} className="text-body font-semibold">
            {t('rules.org.deleteConfirm', { name })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(rule.id, {
                  onSuccess: onDeleted,
                  onError: () => setConfirming(false),
                })
              }
            >
              {t('rules.org.deleteConfirmYes')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              {t('rules.org.deleteConfirmNo')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            aria-label={t('rules.org.editLabel', { name })}
            onClick={onEdit}
          >
            {t('rules.org.edit')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            aria-label={t('rules.org.deleteLabel', { name })}
            onClick={() => setConfirming(true)}
          >
            {t('rules.org.delete')}
          </Button>
        </div>
      )}
    </div>
  );
}
