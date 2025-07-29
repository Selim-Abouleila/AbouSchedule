/* util/date‑helpers.ts */
import {
  addDays, addWeeks, addMonths, addYears,
  startOfDay, startOfWeek, startOfMonth, startOfYear,
  setDay, setDate, set, subDays
} from 'date-fns';
import { Recurrence } from '@prisma/client';



export function nextDate(
  last: Date | null,
  start: Date,
  every = 1,
  type: Recurrence,
  dow?: number | null,           // 0–6 (weekly)
  dom?: number | null,           // 1–31 (monthly & yearly)
  recMonth?: number | null,      // 1–12 (yearly)
  recDom?: number | null,
): Date {

  /* 1 . normalize the reference point */
  const base =
    type === 'DAILY'   ? startOfDay(last ?? start) :
    type === 'WEEKLY'  ? startOfWeek(last ?? start, { weekStartsOn: 1 }) :
    type === 'MONTHLY' ? startOfMonth(last ?? start) :
    type === 'YEARLY'  ? startOfYear(last ?? start) :
    (last ?? start);

  const step = every <= 0 ? 1 : every;


  /** clamp any Date to 21:00 UTC on that same day */
  const atNineUtc = (d: Date) => {
    // 1) go back one full day
    const u = subDays(d, 1);
    // 2) clamp to 21:00 UTC exactly
    u.setUTCHours(21, 0, 0, 0);
    return u;
  };



  switch (type) {
    case 'DAILY':
      return atNineUtc(addDays(base, step));

    case 'WEEKLY': {
      const wanted = dow ?? 1; // default Monday
      let next = addWeeks(base, step); // Start by moving forward
      next = setDay(next, wanted, { weekStartsOn: 1 }); // Adjust to the desired day
      if (next <= base) next = addWeeks(next, 1); // Ensure it's in the future
      return atNineUtc(next);
    }

    case 'MONTHLY': {
      const wanted = dom ?? 1; // default 1st
      let next = addMonths(base, step); // Start by moving forward
      next = setDate(next, wanted); // Adjust to the desired day
      if (next <= base) next = addMonths(next, 1); // Ensure it's in the future
      return atNineUtc(next);
    }

    case 'YEARLY': {
      const m = (recMonth ?? 1) - 1; // JS months 0–11
      const d = recDom ?? 1;

      /* helper: clamp 31 Apr → 30 Apr, 29 Feb → 28 Feb */
      const clamp = (yearStart: Date) => {
        let candidate = set(yearStart, { month: m, date: d });
        return candidate.getMonth() === m
          ? candidate
          : set(yearStart, { month: m, date: 0 }); // last day prev-month
      };

      let next = addYears(base, step); // Start by moving forward
      next = clamp(set(next, { month: m, date: d })); // Adjust and clamp
      if (next <= base) next = addYears(next, 1); // Ensure it's in the future
  return atNineUtc(next);
}

    default:
      return base;            // NONE
  }
}
