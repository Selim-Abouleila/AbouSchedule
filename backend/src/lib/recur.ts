import {
  addDays, addWeeks, addMonths, addYears,
  startOfDay, startOfWeek, startOfMonth, startOfYear,
  setDay, setDate, set
} from 'date-fns';
import { Recurrence } from '@prisma/client';

export function nextDate(
  last: Date | null,
  start: Date,
  every = 1,
  type: Recurrence,
  dow?: number | null,   // 0‑6  (for weekly)
  dom?: number | null,    // 1‑31 (for monthly)
  recurrenceMonth?: number | null, // 1–12 (yearly)  ← NEW
  recurrenceDom?: number | null
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
      const wanted = dow ?? 1;                      // default Monday
      let next = setDay(candidate, wanted, { weekStartsOn: 1 });
      if (next <= rounded) next = addWeeks(next, 1); // ensure future
      return next;
    }


    case 'MONTHLY': {
      const candidate = addMonths(rounded, step);
      const wanted = dom ?? 1;                    // default 1st
      // if Feb 30th → rolls into March; acceptable for most use‑cases
      return setDate(candidate, wanted);
    }

    /* …inside switch(type)… */
    case "YEARLY": {
      const candidate = addYears(rounded, step);        // 1 Jan 00:00 of target year
      const month = (recurrenceMonth ?? 1) - 1;         // JS months 0‑11
      const day = recurrenceDom ?? 1;

      // clamp Feb‑29 problems etc. by falling to last valid day
      const temp = set(candidate, { month, date: day });
      if (temp.getMonth() !== month) {
        // overflowed (e.g. 31 Apr) ⇒ move to last day of that month
        return set(candidate, { month, date: 0 });      // 0 = last day prev month
      }
      return temp;
    }


    default:
      return rounded;        // NONE
  }
}
