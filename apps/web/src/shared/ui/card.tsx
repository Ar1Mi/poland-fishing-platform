import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Border without shadow by default; shadows are only for elements over the map. */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-h2', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-small text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-3', className)} {...props} />;
}
