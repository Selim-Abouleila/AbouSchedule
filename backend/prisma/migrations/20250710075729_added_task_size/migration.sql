-- CreateEnum
CREATE TYPE "Size" AS ENUM ('SMALL', 'LARGE');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "size" "Size" NOT NULL DEFAULT 'LARGE';
