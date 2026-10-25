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

type TextAreaFieldProps = ComponentProps<'textarea'> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Multi-line text with the label above; same states as TextField. */
export function TextAreaField({ label, hint, error, id, className, ...props }: TextAreaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={fieldId} className="text-body font-semibold">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint && hintId, error && errorId)}
        className="min-h-24 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-body text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-destructive"
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

type FileFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Native file picker: the browser's own button is keyboard and screen reader friendly. */
export function FileField({ label, hint, error, id, className, ...props }: FileFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={fieldId} className="text-body font-semibold">
        {label}
      </label>
      <input
        id={fieldId}
        type="file"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint && hintId, error && errorId)}
        className="min-h-12 w-full min-w-0 rounded-md border border-input bg-card p-2 text-body text-foreground file:mr-3 file:h-10 file:rounded-md file:border file:border-primary file:bg-card file:px-4 file:font-semibold file:text-primary aria-invalid:border-2 aria-invalid:border-destructive"
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
