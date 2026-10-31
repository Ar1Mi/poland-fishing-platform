import { type Ref, useId } from 'react';
import { cn } from '../lib/cn';
import { FieldError } from './form-field';

interface SegmentedToggleProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  /** `''`: nothing chosen yet. */
  value: T | '';
  onChange: (value: T) => void;
  error?: string;
  /** Gets the first button: where a form moves the focus to show the error (React Hook Form). */
  focusRef?: Ref<HTMLButtonElement>;
}

/**
 * A choice of two (docs/10-design-system.md → `SegmentedToggle`): buttons with `aria-pressed`
 * on a Toń 100 track; the chosen one is filled. 48 px tall, one tap each.
 */
export function SegmentedToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  focusRef,
}: SegmentedToggleProps<T>) {
  const labelId = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-body font-semibold">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'grid grid-cols-2 gap-1 rounded-md bg-secondary p-1',
          error && 'outline-2 outline-destructive',
        )}
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            ref={index === 0 ? focusRef : undefined}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className="h-12 rounded-md px-3 text-body font-semibold text-secondary-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
