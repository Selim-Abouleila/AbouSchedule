/* util/date‑helpers.ts */
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
    const u = new Date(d);
    u.setUTCHours(21, 0, 0, 0);
    return u;
  };



  switch (type) {
    case 'DAILY':
      return atNineUtc(addDays(base, step));

    /* ---------- WEEKLY ---------- */
    case 'WEEKLY': {
      const wanted = dow ?? 1;                        // default Monday
      // ① try the wanted weekday inside *this* week
      let next = setDay(base, wanted, { weekStartsOn: 1 });
      // ② if that’s not in the future → add the step
      if (next <= (last ?? start)) next = addWeeks(next, step);
      return atNineUtc(next);
    }

    /* ---------- MONTHLY ---------- */
    case 'MONTHLY': {
      const wanted = dom ?? 1;                        // default 1st
      // setDate rolls 31 Feb → 03 Mar etc. (acceptable)
      let next = setDate(base, wanted);
      if (next <= (last ?? start)) {
        next = setDate(addMonths(base, step), wanted);
      }
      return atNineUtc(next);
    }

    /* ---------- YEARLY ---------- */
    case 'YEARLY': {
      const m = (recMonth ?? 1) - 1;                  // JS months 0–11
      const d = recDom ?? 1;

      /* helper: clamp 31 Apr → 30 Apr, 29 Feb → 28 Feb */
      const clamp = (yearStart: Date) => {
        let candidate = set(yearStart, { month: m, date: d });
        return candidate.getMonth() === m
          ? candidate
          : set(yearStart, { month: m, date: 0 });    // last day prev‑month
      };

      // ① date inside *this* year
      let next = clamp(base);
      // ② too late?  go N years forward
      if (next <= (last ?? start)) {
        next = clamp(addYears(base, step));
      }
      return atNineUtc(next);
    }

    default:
      return base;            // NONE
  }
}
