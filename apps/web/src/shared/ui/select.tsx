import { type ComponentProps, useId } from 'react';
import { cn } from '../lib/cn';
import { FieldError } from './form-field';

type SelectFieldProps = ComponentProps<'select'> & { label: string; hint?: string; error?: string };

/**
 * Native select with the label above (docs/10-design-system.md → `Select`); 48 px tall. Hint and
 * error below, tied to the select by `aria-describedby`, as in `TextField`.
 */
export function SelectField({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={fieldId} className="text-body font-semibold">
        {label}
      </label>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 text-body text-foreground aria-invalid:border-2 aria-invalid:border-destructive"
        {...props}
      >
        {children}
      </select>
      {hint && (
        <p id={hintId} className="text-small text-muted-foreground">
          {hint}
        </p>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
