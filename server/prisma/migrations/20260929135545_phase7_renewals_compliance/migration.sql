-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "linkedApprovalId" TEXT;

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "renewalAlertAt" TIMESTAMP(3),
ADD COLUMN     "renewalApplicationId" TEXT,
ADD COLUMN     "renewalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "renewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ComplianceCase" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "applicationId" TEXT,
    "inspectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "remediationDueAt" TIMESTAMP(3),
    "remediationNotes" TEXT,
    "remediatedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCase_inspectionId_key" ON "ComplianceCase"("inspectionId");

-- CreateIndex
CREATE INDEX "ComplianceCase_unitId_status_idx" ON "ComplianceCase"("unitId", "status");

-- CreateIndex
CREATE INDEX "ComplianceCase_status_idx" ON "ComplianceCase"("status");

-- CreateIndex
CREATE INDEX "Application_linkedApprovalId_idx" ON "Application"("linkedApprovalId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_renewalApplicationId_key" ON "Approval"("renewalApplicationId");

-- CreateIndex
CREATE INDEX "Approval_validTill_idx" ON "Approval"("validTill");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_renewalApplicationId_fkey" FOREIGN KEY ("renewalApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_linkedApprovalId_fkey" FOREIGN KEY ("linkedApprovalId") REFERENCES "Approval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
