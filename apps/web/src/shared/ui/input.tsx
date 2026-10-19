import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * Text field. The font stays at 16 px or more, otherwise iOS zooms the page on focus.
 * An error is shown with `aria-invalid` (red border) plus an icon and text under the field.
 */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 text-body text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
