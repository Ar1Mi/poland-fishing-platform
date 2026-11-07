import { useId } from 'react';

export interface Bar {
  id: string;
  label: string;
  value: number;
  /** What the row says next to the label, e.g. `12 · 300,00 zł`. */
  valueText: string;
}

/** Share of the largest value; a non-zero value never shrinks below a visible sliver. */
export function barShare(value: number, max: number): number {
  if (value <= 0 || max <= 0) {
    return 0;
  }
  return Math.max(2, Math.round((value / max) * 100));
}

/**
 * A horizontal bar chart as a list: each row is read as its label and value text, the bar is
 * decoration (`aria-hidden`) — no second copy of the data for screen readers is needed.
 */
export function BarList({ title, bars }: { title: string; bars: Bar[] }) {
  const titleId = useId();
  const max = Math.max(0, ...bars.map((bar) => bar.value));
  return (
    <figure className="flex flex-col gap-3" aria-labelledby={titleId}>
      <figcaption id={titleId} className="caption text-muted-foreground">
        {title}
      </figcaption>
      <ul className="flex flex-col gap-3">
        {bars.map((bar) => (
          <li key={bar.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-body">{bar.label}</span>
              <span className="ml-auto font-mono text-small">{bar.valueText}</span>
            </div>
            <div aria-hidden className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${barShare(bar.value, max)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
