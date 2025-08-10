-- CreateTable
CREATE TABLE "Video" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "fileName" TEXT,
    "duration" INTEGER,
    "thumbnail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Video_taskId_idx" ON "Video"("taskId");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
