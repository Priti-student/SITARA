-- AlterTable
ALTER TABLE "ApprovalType" ADD COLUMN     "workflow" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "approvalTypeId" TEXT,
    "departmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentStepLabel" TEXT,
    "currentStepOrder" INTEGER,
    "slaDueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "workflowInstanceId" TEXT,
    "actorId" TEXT NOT NULL DEFAULT 'system',
    "actorRole" TEXT NOT NULL DEFAULT 'SYSTEM',
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "comment" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "approvalNo" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "approvalTypeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3),
    "validTill" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowInstance_applicationId_idx" ON "WorkflowInstance"("applicationId");

-- CreateIndex
CREATE INDEX "WorkflowInstance_departmentId_status_idx" ON "WorkflowInstance"("departmentId", "status");

-- CreateIndex
CREATE INDEX "WorkflowEvent_applicationId_createdAt_idx" ON "WorkflowEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowEvent_eventType_idx" ON "WorkflowEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_approvalNo_key" ON "Approval"("approvalNo");

-- CreateIndex
CREATE INDEX "Approval_unitId_status_idx" ON "Approval"("unitId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_approvalTypeId_fkey" FOREIGN KEY ("approvalTypeId") REFERENCES "ApprovalType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "WorkflowInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approvalTypeId_fkey" FOREIGN KEY ("approvalTypeId") REFERENCES "ApprovalType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
