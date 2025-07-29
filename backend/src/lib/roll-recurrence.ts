// cron/roll‑recurrence.ts
import cron   from 'node-cron';
import { nextDate } from "./recur";
import { Recurrence } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

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
        }

        /* 3. update row in one DB write */
        await prisma.task.update({
          where: { id: t.id },
          data: {
            lastOccurrence: last,
            nextOccurrence: next,
            status:
              t.status === 'DONE'
                ? t.previousStatus ?? 'ACTIVE'
                : t.status,
            isDone: false,
          },
        });
      }

      console.log(
        `[recurrence] rolled ${dueTasks.length} task(s) at`,
        now.toISOString()
      );
    },
    { timezone: 'Africa/Cairo' }
  );
}
