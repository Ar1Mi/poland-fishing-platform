import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

// Status is never colour alone: pass an icon and text as children.
const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1 rounded-sm border px-2 py-0.5 text-small font-semibold whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-success-tint text-success-tint-foreground',
        warning: 'border-transparent bg-warning-tint text-warning-tint-foreground',
        destructive: 'border-transparent bg-destructive-tint text-destructive-tint-foreground',
        // Waiting for sync: dashed border without fill.
        outline: 'border-dashed border-input bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
