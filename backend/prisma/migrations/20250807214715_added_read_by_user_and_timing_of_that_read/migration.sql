-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "read_at" TIMESTAMP(3),
ADD COLUMN     "read_by_user" BOOLEAN DEFAULT false;
