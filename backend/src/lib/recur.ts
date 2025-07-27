import {
  addDays, addWeeks, addMonths, addYears,
  startOfDay, startOfWeek, startOfMonth, startOfYear,
  setDay, setDate
} from 'date-fns';
import { Recurrence } from '@prisma/client';

export function nextDate(
  last: Date | null,
  start: Date,
  every = 1,
  type: Recurrence,
  dow?: number | null,   // 0‑6  (for weekly)
  dom?: number | null    // 1‑31 (for monthly)
): Date {
  // ① normalise to period start (midnight, Monday, 1st, Jan‑1)
  const rounded =
    type === 'DAILY'   ? startOfDay(last ?? start) :
    type === 'WEEKLY'  ? startOfWeek(last ?? start, { weekStartsOn: 1 }) :
    type === 'MONTHLY' ? startOfMonth(last ?? start) :
    type === 'YEARLY'  ? startOfYear(last ?? start) :
    (last ?? start);

  const step = every <= 0 ? 1 : every;

  switch (type) {
    case 'DAILY':
      return addDays(rounded, step);

    case 'WEEKLY': {
      const candidate = addWeeks(rounded, step);
      // snap to requested weekday (default Monday 0 = Sunday => 1 = Monday)
      const wanted = dow ?? 1;
      return setDay(candidate, wanted, { weekStartsOn: 1 });
    }

    case 'MONTHLY': {
      const candidate = addMonths(rounded, step);
      const wanted = dom ?? 1;                    // default 1st
      // if Feb 30th → rolls into March; acceptable for most use‑cases
      return setDate(candidate, wanted);
    }

    case 'YEARLY':
      return addYears(rounded, step);

    default:
      return rounded;        // NONE
  }
}
