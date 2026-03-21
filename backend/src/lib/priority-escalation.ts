// ── priority-escalation.ts ─────────────────────────────────────────────────
//
// Daily cron that promotes stale, non-recurring ACTIVE tasks one priority
// level up when a user's low-priority pressure exceeds a computed threshold.
//
// Escalation ladder (one step per day maximum):
//   NONE → THREE → TWO → ONE    (IMMEDIATE is never touched by this cron)
//
// Only tasks that satisfy ALL of the following are eligible:
//   • status  = ACTIVE
//   • recurrence = NONE
//   • priority ∈ { NONE, THREE, TWO }   (ONE is the ceiling)
//   • createdAt <= now - MIN_AGE_DAYS
// ──────────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { PrismaClient, Priority, Recurrence, Status } from '@prisma/client';

const prisma = new PrismaClient();

// ── ONE KNOB TO TUNE ──────────────────────────────────────────────────────
//
//  ESCALATION_SENSITIVITY controls how aggressively the cron promotes tasks.
//
//  Range : 1 (very conservative — rare upgrades)
//       to 10 (aggressive — upgrades fire often)
//  Default: 5  (balanced)
//
//  Internally it drives four derived parameters (see derivations below).
//  You should only need to change this one value.
//
const ESCALATION_SENSITIVITY = 5;
// ─────────────────────────────────────────────────────────────────────────

// ── Derived parameters (computed once at startup) ─────────────────────────

/**
 * ratio must be >= this to trigger an escalation.
 * Formula: 4.0 - (S × 0.3)
 * S=1 → 3.7 (hard to fire), S=5 → 2.5, S=10 → 1.0 (fires easily)
 */
const ESCALATION_THRESHOLD = 4.0 - ESCALATION_SENSITIVITY * 0.3;

/**
 * Added to the denominator before dividing.
 * Prevents div-by-zero and dampens the ratio when there are few high tasks.
 * Formula: 2.0 - (S × 0.15)
 * S=1 → 1.85, S=5 → 1.25, S=10 → 0.5
 */
const PRESSURE_FLOOR = Math.max(0.1, 2.0 - ESCALATION_SENSITIVITY * 0.15);

/**
 * How much each extra day (past MIN_AGE_DAYS) inflates a task's score.
 * Formula: S × 0.01
 * S=1 → 0.01 (age barely matters), S=5 → 0.05, S=10 → 0.10
 */
const AGE_WEIGHT_PER_DAY = ESCALATION_SENSITIVITY * 0.01;

/**
 * Minimum task age in days before it is considered for escalation.
 * Formula: 14 - S   (floor at 1 to always require at least 1 day)
 * S=1 → 13 days, S=5 → 9 days, S=10 → 4 days
 */
const MIN_AGE_DAYS = Math.max(1, 14 - ESCALATION_SENSITIVITY);

// ── Fixed size weights (unlikely to need tuning) ──────────────────────────
const SIZE_WEIGHTS: Record<string, number> = {
    SMALL: 1.0,
    NORMAL: 1.5,
    LARGE: 2.5,
};

// ── Priority ordering helpers ─────────────────────────────────────────────

/** Priorities that can be escalated (in ascending urgency order) */
const ESCALATABLE: Priority[] = [
    Priority.NONE,
    Priority.THREE,
    Priority.TWO,
];

/** What each escalatable priority promotes to */
const NEXT_PRIORITY: Partial<Record<Priority, Priority>> = {
    [Priority.NONE]: Priority.THREE,
    [Priority.THREE]: Priority.TWO,
    [Priority.TWO]: Priority.ONE,
};

/** Tiers considered "low pressure" (numerator) */
const LOW_TIERS = new Set<Priority>([Priority.NONE, Priority.THREE]);

/** Tiers considered "high pressure" (denominator) */
const HIGH_TIERS = new Set<Priority>([Priority.TWO, Priority.ONE]);

// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute a pressure score for a single task.
 *
 *   score = sizeWeight × ageBonus
 *   ageBonus = 1 + (daysOlderThanMinAge × AGE_WEIGHT_PER_DAY)
 */
function taskScore(
    size: string,
    createdAt: Date,
    now: Date,
): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    const ageInDays = (now.getTime() - createdAt.getTime()) / msPerDay;
    const excessDays = Math.max(0, ageInDays - MIN_AGE_DAYS);
    const ageBonus = 1 + excessDays * AGE_WEIGHT_PER_DAY;
    const sizeWeight = SIZE_WEIGHTS[size] ?? 1.0;
    return sizeWeight * ageBonus;
}

// ─────────────────────────────────────────────────────────────────────────

export function startPriorityEscalation() {
    // Runs at 23:55 Cairo time — just before midnight, after the day's work
    // and before the recurrence roller fires at 00:00.
    cron.schedule(
        '55 23 * * *',
        async () => {
            const now = new Date();
            try {
                // ── 1. Fetch all eligible tasks across all users ──────────────────
                const minAgeDate = new Date(now.getTime() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000);

                const candidates = await prisma.task.findMany({
                    where: {
                        status: Status.ACTIVE,
                        recurrence: Recurrence.NONE,
                        priority: { in: ESCALATABLE },
                        createdAt: { lte: minAgeDate },
                    },
                    select: {
                        id: true,
                        userId: true,
                        priority: true,
                        size: true,
                        createdAt: true,
                        title: true,
                    },
                });

                if (candidates.length === 0) {
                    console.log('[priority-escalation] no eligible tasks found — done.');
                    return;
                }

                // ── 2. Group candidates by userId ─────────────────────────────────
                const byUser = new Map<number, typeof candidates>();
                for (const task of candidates) {
                    if (task.userId == null) continue;
                    if (!byUser.has(task.userId)) byUser.set(task.userId, []);
                    byUser.get(task.userId)!.push(task);
                }

                let totalUpgrades = 0;

                // ── 3. Evaluate each user independently ───────────────────────────
                for (const [userId, tasks] of byUser) {
                    // Compute score for every task
                    const scored = tasks.map(t => ({
                        ...t,
                        score: taskScore(t.size, t.createdAt, now),
                    }));

                    // Split into low / high buckets
                    let lowPressure = 0;
                    let highPressure = 0;

                    for (const t of scored) {
                        if (LOW_TIERS.has(t.priority)) lowPressure += t.score;
                        else if (HIGH_TIERS.has(t.priority)) highPressure += t.score;
                    }

                    const ratio = lowPressure / (highPressure + PRESSURE_FLOOR);

                    console.log(
                        `[priority-escalation] user=${userId}  ` +
                        `low=${lowPressure.toFixed(2)}  high=${highPressure.toFixed(2)}  ` +
                        `ratio=${ratio.toFixed(2)}  threshold=${ESCALATION_THRESHOLD}`
                    );

                    if (ratio < ESCALATION_THRESHOLD) {
                        console.log(`[priority-escalation] user=${userId}  → below threshold, no upgrade`);
                        continue;
                    }

                    // ── 4. Pick the highest-scored task in the LOWEST available tier ─
                    // (We prefer to promote from NONE before THREE, THREE before TWO)
                    let candidate: (typeof scored)[0] | null = null;

                    for (const tier of [Priority.NONE, Priority.THREE, Priority.TWO]) {
                        const tierTasks = scored.filter(t => t.priority === tier);
                        if (tierTasks.length === 0) continue;

                        // Highest pressure score wins
                        tierTasks.sort((a, b) => b.score - a.score);
                        candidate = tierTasks[0];
                        break;
                    }

                    if (!candidate) continue;

                    const newPriority = NEXT_PRIORITY[candidate.priority];
                    if (!newPriority) continue;

                    // ── 5. Apply the upgrade ─────────────────────────────────────────
                    await prisma.task.update({
                        where: { id: candidate.id },
                        data: { priority: newPriority },
                    });

                    totalUpgrades++;
                    console.log(
                        `[priority-escalation] user=${userId}  ` +
                        `upgraded task#${candidate.id} "${candidate.title}"  ` +
                        `${candidate.priority} → ${newPriority}  (score=${candidate.score.toFixed(2)})`
                    );
                }

                console.log(
                    `[priority-escalation] run complete at ${now.toISOString()}  ` +
                    `upgrades=${totalUpgrades}  users_checked=${byUser.size}  ` +
                    `sensitivity=${ESCALATION_SENSITIVITY}`
                );
            } catch (err) {
                console.error(
                    `[priority-escalation] ❌ cron failed at ${now.toISOString()}:`,
                    err
                );
            }
        },
        { timezone: 'Africa/Cairo' },
    );
}
