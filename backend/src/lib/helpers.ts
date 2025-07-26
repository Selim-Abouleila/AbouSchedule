/* helpers.ts ---------------------------------------------------- */
export const SORT_PRESETS: Record<string, any[]> = {
  // ① priority → status → size
    'priority': [
        { isDone: 'asc' },   // open tasks first, DONE tasks last
        { priority: 'asc' },
        { status: 'asc' },
        { size: 'asc' },
        // optional tie‑breaker
        { dueAt: 'asc' },
    ],

  // ② recently added first   (needs a createdAt column!)
  'recent': [
    { createdAt: 'desc' },
    { priority: 'asc' },
    { status  : 'asc' },
    { size    : 'asc' },
  ],

  // ③ custom status order → ACTIVE › DONE › PENDING
  // Postgres keeps enum order *as defined* in the schema.
  // If your Prisma enum was declared ACTIVE,DONE,PENDING you’re done:
  'status': [
    { status: 'asc' },
    { priority: 'asc' },
  ],
} as const;
