-- AlterTable
ALTER TABLE "Build" ADD COLUMN "templateMeta" TEXT,
ADD COLUMN "templateRefs" TEXT,
ADD COLUMN "globalStyles" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN "customCss" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "BuildSnapshot" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'sync',
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuildSnapshot_buildId_idx" ON "BuildSnapshot"("buildId");

-- CreateIndex
CREATE INDEX "BuildSnapshot_projectId_idx" ON "BuildSnapshot"("projectId");

-- AddForeignKey
ALTER TABLE "BuildSnapshot" ADD CONSTRAINT "BuildSnapshot_buildId_projectId_fkey" FOREIGN KEY ("buildId", "projectId") REFERENCES "Build"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildSnapshot" ADD CONSTRAINT "BuildSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
