import {
  addDays,   addWeeks,   addMonths,   addYears,
  startOfDay, startOfWeek, startOfMonth, startOfYear
} from "date-fns";
import { Recurrence } from "@prisma/client";

export function nextDate(
  last: Date | null,
  start: Date,
  every = 1,
  type: Recurrence
): Date {
  const base = last ?? start;

  // Special meaning for “0” → roll over at the *start* of the next period
  if (every === 0) {
    switch (type) {
      case "DAILY":   return addDays(  startOfDay(base),   1);
      case "WEEKLY":  return addWeeks( startOfWeek(base, { weekStartsOn: 1 }), 1); // Monday‑based
      case "MONTHLY": return addMonths(startOfMonth(base), 1);
      case "YEARLY":  return addYears( startOfYear(base),  1);
      default:        return base;                       // NONE
    }
  }

  // Normal logic for every ≥ 1
  switch (type) {
    case "DAILY":   return addDays(base,   every);
    case "WEEKLY":  return addWeeks(base,  every);
    case "MONTHLY": return addMonths(base, every);
    case "YEARLY":  return addYears(base,  every);
    default:        return base;
  }
}
