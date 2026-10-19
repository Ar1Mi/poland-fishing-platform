import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

// docs/10-design-system.md → «Компоненты». `accent` — at most one per screen (checked on review).
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-body font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        accent: 'border-transparent bg-accent text-accent-foreground hover:bg-accent/90',
        primary: 'border-transparent bg-primary text-primary-foreground hover:bg-primary-dark',
        secondary: 'border-primary bg-card text-primary hover:bg-secondary',
        ghost: 'border-transparent bg-transparent text-primary hover:bg-secondary',
        destructive: 'border-destructive bg-card text-destructive hover:bg-destructive-tint',
      },
      size: {
        // 48 px on the phone by default; 40 px only in organisation and admin tables.
        default: 'h-12 px-5',
        compact: 'h-10 px-4',
        icon: 'size-12',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Renders the child element (e.g. a router `Link`) with button styles. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
