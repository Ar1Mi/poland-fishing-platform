import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '../../../shared/ui/card';

/** Narrow card for the account screens; the title is the page heading. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          <h1 className="text-h1">{title}</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </div>
  );
}
