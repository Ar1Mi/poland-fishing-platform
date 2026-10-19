import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const alertVariants = cva(
  'grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-md border p-4 text-small [&>svg]:row-span-2 [&>svg]:size-5 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        info: 'border-secondary bg-secondary text-secondary-foreground',
        success: 'border-success/30 bg-success-tint text-success-tint-foreground',
        warning: 'border-warning/30 bg-warning-tint text-warning-tint-foreground',
        destructive: 'border-destructive/30 bg-destructive-tint text-destructive-tint-foreground',
      },
    },
    defaultVariants: { variant: 'info' },
  },
);

type AlertProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>;

/** Message block: icon, title and text (RuleAlert builds on it). */
export function Alert({ className, variant, role = 'alert', ...props }: AlertProps) {
  return <div role={role} className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('col-start-2 text-body font-semibold', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('col-start-2', className)} {...props} />;
}
