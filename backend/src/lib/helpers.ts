/* helpers.ts ---------------------------------------------------- */

// Custom size ordering: SMALL -> NORMAL -> LARGE
const SIZE_ORDER = {
  'SMALL': 1,
  'NORMAL': 2, 
  'LARGE': 3
} as const;

// Custom sorting function for size
export const sortBySize = (a: any, b: any) => {
  return SIZE_ORDER[a.size as keyof typeof SIZE_ORDER] - SIZE_ORDER[b.size as keyof typeof SIZE_ORDER];
};

export const SORT_PRESETS: Record<string, any[]> = {
  // ① priority → status → size
    'priority': [
        { isDone: 'asc' },   
        { priority: 'asc' },
        { status: 'desc' },
        { size: 'asc' },
        // optional tie‑breaker
        { dueAt: 'asc' },
        { createdAt: 'asc' },
    ],

  // ② recently added first   (needs a createdAt column!)
  'recent': [
    { createdAt: 'desc' },
    { isDone: 'asc' },
    { priority: 'asc' },
    { status  : 'asc' },
    { size    : 'asc' },
  ],
  
  // If your Prisma enum was declared PENDING, ACTIVE, DONE you're done:
   'status‑active': [
    { isDone: 'asc' },
    { status  : 'desc' },
    { priority: 'asc' },
    { size: 'asc' },
    { dueAt: 'asc' },
    { createdAt: 'asc' },
  ],


  'status‑pending': [
    { isDone: 'asc' },
    { status  : 'asc' },
    { priority: 'asc' },
    { size: 'asc' },
    { dueAt: 'asc' },
    { createdAt: 'asc' },
  ],

  'status‑done': [               
    { status  : 'desc' },        
    { priority: 'asc' },
    { size: 'asc' },
    { dueAt: 'asc' },
    { createdAt: 'asc' },
  ],

 
} as const;
