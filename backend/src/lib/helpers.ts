/* helpers.ts ---------------------------------------------------- */

// Custom size ordering: SMALL -> NORMAL -> LARGE
const SIZE_ORDER = {
  'SMALL': 1,
  'NORMAL': 2, 
  'LARGE': 3
} as const;

// Priority ordering (lower number = higher priority)
const PRIORITY_ORDER = {
  'IMMEDIATE': 1,
  'ONE': 2,
  'TWO': 3,
  'THREE': 4,
  'NONE': 5,
  'RECURRENT': 6
} as const;

// Status ordering (ACTIVE first, then PENDING, then DONE)
const STATUS_ORDER = {
  'ACTIVE': 1,
  'PENDING': 2,
  'DONE': 3
} as const;

// Comprehensive custom sorting function
export const customSortTasks = (orderBy: any[]) => {
  return (a: any, b: any) => {
    for (const sortItem of orderBy) {
      const key = Object.keys(sortItem)[0];
      const direction = sortItem[key];
      
      let comparison = 0;
      
      if (key === 'size') {
        comparison = SIZE_ORDER[a.size as keyof typeof SIZE_ORDER] - SIZE_ORDER[b.size as keyof typeof SIZE_ORDER];
      } else if (key === 'priority') {
        comparison = PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] - PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER];
      } else if (key === 'status') {
        comparison = STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] - STATUS_ORDER[b.status as keyof typeof STATUS_ORDER];
      } else if (key === 'isDone') {
        comparison = Number(a.isDone) - Number(b.isDone);
      } else if (key === 'dueAt') {
        const aDate = a.dueAt ? new Date(a.dueAt).getTime() : 0;
        const bDate = b.dueAt ? new Date(b.dueAt).getTime() : 0;
        comparison = aDate - bDate;
      } else if (key === 'createdAt') {
        const aDate = new Date(a.createdAt).getTime();
        const bDate = new Date(b.createdAt).getTime();
        comparison = aDate - bDate;
      }
      
      // Apply direction (asc/desc)
      if (direction === 'desc') {
        comparison = -comparison;
      }
      
      // If this comparison is not equal, return it
      if (comparison !== 0) {
        return comparison;
      }
    }
    
    // If all comparisons are equal, maintain original order
    return 0;
  };
};

// Legacy function for backward compatibility
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
