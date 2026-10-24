import { type ComponentProps, useId } from 'react';
import { cn } from '../lib/cn';

type SelectFieldProps = ComponentProps<'select'> & { label: string };

/** Native select with the label above (docs/10-design-system.md → `Select`); 48 px tall. */
export function SelectField({ label, id, className, children, ...props }: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={fieldId} className="text-body font-semibold">
        {label}
      </label>
      <select
        id={fieldId}
        className="h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 text-body text-foreground"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
