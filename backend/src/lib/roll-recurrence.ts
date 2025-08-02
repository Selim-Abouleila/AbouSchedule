// cron/roll‑recurrence.ts
import cron   from 'node-cron';
import { nextDate } from "./recur";
import { Recurrence } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import {
  addDays, addWeeks, addMonths, addYears,
  startOfDay, startOfWeek, startOfMonth, startOfYear,
  setDay, setDate, set, subDays
} from 'date-fns';
const prisma = new PrismaClient();

export function startRecurrenceRoller() {
  /* “0 0 * * *” = midnight every day; TZ makes it Cairo midnight */
  cron.schedule(
    '0 0 * * *',
    async () => {
      const now = new Date();

      /* 1. pull every recurring task whose nextOccurrence is due */
      const dueTasks = await prisma.task.findMany({
        where: {
          recurrence: { not: Recurrence.NONE },
          nextOccurrence: { lte: now },
          OR: [
            { recurrenceEnd: null },  // No end date
            { recurrenceEnd: { gt: now } }  // End date is in the future
          ],
        },
      });

      for (const t of dueTasks) {
        let last  = t.nextOccurrence!;
        let next  = nextDate(
          last,
          t.dueAt ?? last,
          t.recurrenceEvery ?? 1,
          t.recurrence,
          t.recurrenceDow,
          t.recurrenceDom,
          t.recurrenceMonth,
          t.recurrenceDom
        );

        /* 2. if we missed multiple periods (server was down) loop until future */
        while (next <= now) {
          // Check if we've reached the recurrence end date
          if (t.recurrenceEnd && next > t.recurrenceEnd) {
            // Stop rolling - we've reached the end date
            break;
          }
          
          last = next;
          next = nextDate(
            last,
            t.dueAt ?? last,
            t.recurrenceEvery ?? 1,
            t.recurrence,
            t.recurrenceDow,
            t.recurrenceDom,
            t.recurrenceMonth,
            t.recurrenceDom
          );

          if (next <= last) {
            // nudge it forward — one day is plenty, one minute also works
            next = addDays(last, 1);         // or addMinutes(last, 1)
          }
        }

        /* 3. Check if task has reached its end date */
        const hasReachedEndDate = t.recurrenceEnd && next > t.recurrenceEnd;
        
        /* 4. update row in one DB write */
        await prisma.task.update({
          where: { id: t.id },
          data: {
            lastOccurrence: last,
            nextOccurrence: hasReachedEndDate ? null : next,
            status: hasReachedEndDate 
              ? 'DONE'  // Mark as done when end date is reached
              : (t.status === 'DONE'
                  ? t.previousStatus ?? 'ACTIVE'
                  : t.status),
            isDone: hasReachedEndDate ? true : false,
          },
        });
      }

      console.log(
        `[recurrence] rolled ${dueTasks.length} task(s) at ${now.toISOString()}`,
        dueTasks.length > 0 ? `(checked for end dates)` : ''
      );
    },
    { timezone: 'Africa/Cairo' }
  );
}
