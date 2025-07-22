-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrence" "Recurrence" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "recurrenceEnd" TIMESTAMP(3),
ADD COLUMN     "recurrenceEvery" INTEGER,
ADD COLUMN     "timeCapMinutes" INTEGER;
