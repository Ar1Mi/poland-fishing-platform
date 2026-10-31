import { CatchFate, warsawDateTimeLocal } from '@lowisko/shared';
import { CircleCheck, CircleX, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatTime } from '../../../shared/lib/format';
import { ApiErrorAlert } from '../../../shared/ui/api-error-alert';
import { Badge } from '../../../shared/ui/badge';
import { Button } from '../../../shared/ui/button';
import type { MyPermit } from '../../permits/api/usePurchase';
import type { Species } from '../../rules/api/useRules';
import { formatWeight, speciesName } from '../../rules/lib/format-rule';
import { type Catch, useDeleteCatch, useUpdateCatch } from '../api/useCatches';
import { type CatchPlace, catchPlaces, formatLength, formatWeightInput } from '../lib/catch-form';
import { CatchForm, type CatchFormSubmit } from './CatchForm';
import { RuleAlerts } from './RuleAlerts';

/**
 * A catch of the register (docs/10-design-system.md → `CatchRow`): species, kept or released
 * and time; length and weight on the right. Within the BR-07 window it is corrected in place
 * or deleted after a second confirmation.
 */
export function CatchRow({
  fish,
  species,
  permits,
  onDeleted,
}: {
  fish: Catch;
  species: Species[];
  permits: MyPermit[];
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pl';
  const confirmId = useId();
  const [mode, setMode] = useState<Mode>('view');
  const focus = useModeFocus(mode);
  const update = useUpdateCatch();
  const remove = useDeleteCatch();
  const kind = species.find((item) => item.id === fish.speciesId);
  const name = kind ? speciesName(kind, i18n.resolvedLanguage) : '';
  const time = formatTime(fish.caughtAt, locale);
  // The server decides; this only hides buttons that would fail.
  const editable = Date.parse(fish.editableUntil) > Date.now();
  const accepted = fish.status === 'ACCEPTED';

  if (mode === 'edit') {
    const shownTime = warsawDateTimeLocal(new Date(fish.caughtAt));
    // The position is not changed by a correction (docs/05-api.md).
    const onSubmit = ({ place, ...changed }: CatchFormSubmit) => {
      const caughtAt = warsawDateTimeLocal(changed.caughtAt);
      update.mutate(
        {
          id: fish.id,
          speciesId: changed.speciesId,
          fishingWaterId: place.waterId,
          // The form shows minutes: an unchanged time keeps its seconds.
          caughtAt: caughtAt === shownTime ? undefined : changed.caughtAt.toISOString(),
          lengthCm: changed.lengthCm,
          weightG: changed.weightG,
          kept: changed.kept,
        },
        { onSuccess: () => setMode('view') },
      );
    };
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h3 ref={focus.editHeading} tabIndex={-1} className="text-h2 focus:outline-none">
          {t('catches.form.titleEdit')}
        </h3>
        <CatchForm
          places={editPlaces(fish, permits)}
          species={species}
          initial={{
            place: placeKeyOf(fish),
            speciesId: fish.speciesId,
            fate: fish.kept ? CatchFate.KEPT : CatchFate.RELEASED,
            lengthCm: String(fish.lengthCm),
            weightKg: formatWeightInput(fish.weightG, locale),
            caughtAt: shownTime,
          }}
          submitLabel={t('catches.form.save')}
          pending={update.isPending}
          error={update.error}
          onSubmit={onSubmit}
          onCancel={() => {
            update.reset();
            setMode('view');
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body font-semibold">{name}</span>
          <span className="text-small">
            {t('catches.register.fateAndTime', {
              fate: t(`catches.fate.${fish.kept ? 'KEPT' : 'RELEASED'}`),
              time,
            })}
          </span>
          <span className="text-small text-muted-foreground">{fish.water.name}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-body">
          <span>{formatLength(fish.lengthCm, locale)}</span>
          {fish.weightG !== null && <span>{formatWeight(fish.weightG, locale)}</span>}
        </div>
      </div>
      <Badge variant={accepted ? 'success' : 'destructive'}>
        {accepted ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
        {t(`catches.status.${fish.status}`)}
      </Badge>
      {!accepted && <RuleAlerts violations={fish.violations} />}
      {editable && (
        <>
          <p className="text-small text-muted-foreground">
            {t('catches.register.editableUntil', {
              until: formatDateTime(fish.editableUntil, locale),
            })}
          </p>
          {mode === 'confirmDelete' ? (
            <div className="flex flex-col gap-2" role="group" aria-labelledby={confirmId}>
              <p id={confirmId} className="text-body font-semibold">
                {t('catches.register.deleteConfirm')}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(fish.id, { onSuccess: onDeleted })}
                >
                  {t('catches.register.deleteConfirmYes')}
                </Button>
                <Button ref={focus.confirmNo} variant="ghost" onClick={() => setMode('view')}>
                  {t('catches.register.deleteConfirmNo')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                ref={focus.editButton}
                variant="secondary"
                aria-label={t('catches.register.editLabel', { name, time })}
                onClick={() => setMode('edit')}
              >
                <Pencil aria-hidden />
                {t('catches.register.edit')}
              </Button>
              <Button
                ref={focus.deleteButton}
                variant="destructive"
                aria-label={t('catches.register.deleteLabel', { name, time })}
                onClick={() => setMode('confirmDelete')}
              >
                <Trash2 aria-hidden />
                {t('catches.register.delete')}
              </Button>
            </div>
          )}
        </>
      )}
      {/* Outside the window check: after EDIT_WINDOW_CLOSED the list shows the row closed. */}
      {remove.isError && <ApiErrorAlert error={remove.error} />}
    </div>
  );
}

type Mode = 'view' | 'edit' | 'confirmDelete';

/**
 * Where the focus goes when the row changes, so it never falls back to the page: into the form
 * or onto «Anuluj» of the confirmation, and back to the button that opened them.
 */
function useModeFocus(mode: Mode) {
  const editHeading = useRef<HTMLHeadingElement>(null);
  const confirmNo = useRef<HTMLButtonElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const previous = useRef(mode);
  useEffect(() => {
    const from = previous.current;
    previous.current = mode;
    if (from === mode) {
      return;
    }
    const target =
      mode === 'edit'
        ? editHeading
        : mode === 'confirmDelete'
          ? confirmNo
          : from === 'edit'
            ? editButton
            : deleteButton;
    target.current?.focus();
  }, [mode]);
  return { editHeading, confirmNo, editButton, deleteButton };
}

const placeKeyOf = (fish: Catch) =>
  `${fish.permitId ?? fish.externalPermitId ?? ''}:${fish.water.id}`;

/** The waters of the catch's permit — the permit itself does not change (docs/05-api.md). */
function editPlaces(fish: Catch, permits: MyPermit[]): CatchPlace[] {
  const permit = permits.find((item) => item.id === fish.permitId);
  const places = permit ? catchPlaces([permit]) : [];
  return places.some((place) => place.key === placeKeyOf(fish))
    ? places
    : [
        ...places,
        {
          key: placeKeyOf(fish),
          permitId: fish.permitId ?? '',
          waterId: fish.water.id,
          waterName: fish.water.name,
          permitName: null,
        },
      ];
}
