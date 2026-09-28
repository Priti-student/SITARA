-- AlterTable
ALTER TABLE "ApprovalType" ADD COLUMN     "formSchema" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "approvalTypeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "formData" JSONB NOT NULL DEFAULT '{}',
    "riskCategory" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'UPLOAD',
    "unitDocumentId" TEXT,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'VALIDATED',
    "validationErrors" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitDocument" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL DEFAULT '',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_applicationNo_key" ON "Application"("applicationNo");

-- CreateIndex
CREATE INDEX "Application_createdById_idx" ON "Application"("createdById");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_unitId_idx" ON "Application"("unitId");

-- CreateIndex
CREATE INDEX "ApplicationDocument_applicationId_idx" ON "ApplicationDocument"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitDocument_unitId_documentTypeId_key" ON "UnitDocument"("unitId", "documentTypeId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_approvalTypeId_fkey" FOREIGN KEY ("approvalTypeId") REFERENCES "ApprovalType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_unitDocumentId_fkey" FOREIGN KEY ("unitDocumentId") REFERENCES "UnitDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitDocument" ADD CONSTRAINT "UnitDocument_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitDocument" ADD CONSTRAINT "UnitDocument_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
