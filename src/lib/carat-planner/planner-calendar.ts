const DAY_MS = 86_400_000;

/** Resource dates use Angular's UTC calendar semantics, including date prefixes. */
export function plannerUtcDay(value: string | Date | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? undefined
    : Math.trunc(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

export function plannerDayKey(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Display/fallback timestamps honor offsets; ledger calendar-day prefixes do not. */
export function plannerTimestampDateKey(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Imported user dates must be actual calendar dates, not rolled-over resources. */
export function validPlannerDateKey(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? '' : value;
}

export function plannerCalendarMonthFrom(anchor: Date, offset: number): Date {
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offset, 1));
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(anchor.getUTCDate(), days))
  );
}
