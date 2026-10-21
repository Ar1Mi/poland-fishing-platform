import { CircleAlert } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId } from 'react';
import { cn } from '../lib/cn';
import { Input } from './input';

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1 text-small text-destructive">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

const describedBy = (...ids: (string | false | undefined)[]) =>
  ids.filter(Boolean).join(' ') || undefined;

type TextFieldProps = ComponentProps<'input'> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Label above the field, hint and error below (docs/10-design-system.md → `Input`). */
export function TextField({ label, hint, error, id, className, ...props }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={fieldId} className="text-body font-semibold">
        {label}
      </label>
      <Input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint && hintId, error && errorId)}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-small text-muted-foreground">
          {hint}
        </p>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

type CheckboxFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: ReactNode;
  error?: string;
};

/** Checkbox with a label that is a 48 px tall touch target. */
export function CheckboxField({ label, error, id, className, ...props }: CheckboxFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex min-h-12 items-center gap-3">
        <input
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(error && errorId)}
          className="size-6 shrink-0 accent-primary"
          {...props}
        />
        <label htmlFor={fieldId} className="text-body">
          {label}
        </label>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
