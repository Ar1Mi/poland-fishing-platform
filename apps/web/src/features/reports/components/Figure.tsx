/** One number of a statistics card (Plex Mono), with its label and an optional note. */
export function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-background p-3">
      <dt className="caption text-muted-foreground">{label}</dt>
      <dd className="font-mono text-h2">{value}</dd>
      {hint && <dd className="text-small text-muted-foreground">{hint}</dd>}
    </div>
  );
}
