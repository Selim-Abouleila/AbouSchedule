/* helpers.ts ---------------------------------------------------- */
export const SORT_PRESETS: Record<string, any[]> = {
  // ① priority → status → size
  'priority': [
    { priority: 'asc' },
    { status  : 'asc' },
    { size    : 'asc' },
  ],

  // ② recently added first   (needs a createdAt column!)
  'recent': [
    { createdAt: 'desc' },
  ],

  // ③ custom status order → ACTIVE › DONE › PENDING
  // Postgres keeps enum order *as defined* in the schema.
  // If your Prisma enum was declared ACTIVE,DONE,PENDING you’re done:
  'status': [
    { status: 'asc' },
    { priority: 'asc' },
  ],
} as const;
