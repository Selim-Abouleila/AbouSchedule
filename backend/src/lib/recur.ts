import { Recurrence } from "@prisma/client";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";

export function nextDate(
  last: Date | null,
  start: Date,                     // createdAt
  every = 1,                       // recurrenceEvery
  type: Recurrence
): Date {
  const base = last ?? start;
  switch (type) {
    case "DAILY":   return addDays(base,   every);
    case "WEEKLY":  return addWeeks(base,  every);
    case "MONTHLY": return addMonths(base, every);
    case "YEARLY":  return addYears(base,  every);
    default:        return base;          // NONE
  }
}
