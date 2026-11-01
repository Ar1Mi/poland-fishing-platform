import { ShieldCheck, ShieldX } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { cn } from '../../../shared/lib/cn';

/**
 * `VerdictBanner` of the design system: the verdict of a check in a full-width fill, a 56 px icon
 * and the H1 of the screen, readable at a glance in the sun.
 */
export function VerdictBanner({
  valid,
  title,
  children,
  headingRef,
}: {
  valid: boolean;
  title: string;
  children?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const Icon = valid ? ShieldCheck : ShieldX;
  return (
    <div
      className={cn(
        '-mx-4 flex items-center gap-4 px-4 py-6 sm:mx-0 sm:rounded-lg',
        valid ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground',
      )}
    >
      <Icon aria-hidden className="size-14 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 ref={headingRef} tabIndex={-1} className="text-h1 focus:outline-none">
          {title}
        </h1>
        {children && <div className="text-body">{children}</div>}
      </div>
    </div>
  );
}
