import { PrismaClient } from '@prisma/client';

// Single shared instance — never instantiate PrismaClient anywhere else.
// Multiple instances each open their own connection pool which causes memory
// growth and eventually gets the process OOM-killed by Railway.
export const prisma = new PrismaClient();
