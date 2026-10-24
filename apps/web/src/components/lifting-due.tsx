import type { ColumnDef } from '@tanstack/react-table';

const DAY = 86_400_000;

/** Whole calendar days from today to the lifting due date; negative = overdue. */
export function liftingDaysLeft(liftingDate: string | Date | null | undefined): number | null {
  if (!liftingDate) return null;
  const d = new Date(liftingDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  // Dates are stored as UTC midnight; compare against today's local calendar date.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - today) / DAY);
}

/** Lifting-due colour: red under 5 days (or overdue), yellow 5–15 days, green beyond 15. */
export function liftingTone(liftingDate: string | Date | null | undefined): { color: string; label: string } {
  const days = liftingDaysLeft(liftingDate);
  if (days == null) return { color: '#94a3b8', label: 'No lifting date' };
  if (days < 5) {
    return { color: '#ef4444', label: days < 0 ? `Overdue ${-days}d` : days === 0 ? 'Due today' : `${days} days` };
  }
  if (days <= 15) return { color: '#f59e0b', label: `${days} days` };
  return { color: '#22c55e', label: `${days} days` };
}

const LEGEND = [
  { color: '#ef4444', label: 'Less than 5 days' },
  { color: '#f59e0b', label: '5 – 15 days' },
  { color: '#22c55e', label: 'Above 15 days' },
  { color: '#94a3b8', label: 'No lifting date' },
];

export function LiftingLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground ${className}`}>
      <span className="font-medium">Lifting due:</span>
      {LEGEND.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3.5 rounded-sm" style={{ background: c.color }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

/** Colour bar at the row's left edge, by the row's lifting due date. */
export function liftingBarColumn<T>(getDate: (row: T) => string | null | undefined): ColumnDef<T, any> {
  return {
    id: '_lifting', header: '', enableSorting: false,
    meta: { cellClassName: 'relative p-0', headerClassName: 'p-0' },
    cell: ({ row }) => {
      const t = liftingTone(getDate(row.original));
      return (
        <>
          <span title={`Lifting: ${t.label}`} className="absolute inset-y-0 left-0 w-2" style={{ background: t.color }} />
          <span className="block w-5" aria-hidden />
        </>
      );
    },
  };
}
