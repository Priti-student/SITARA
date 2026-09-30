-- CreateTable
CREATE TABLE "Grievance" (
    "id" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "slaDueAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT,
    "applicationId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "responseNotes" TEXT,
    "respondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grievance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrievanceEvent" (
    "id" TEXT NOT NULL,
    "grievanceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL DEFAULT 'system',
    "actorRole" TEXT NOT NULL DEFAULT 'SYSTEM',
    "eventType" TEXT NOT NULL,
    "comment" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrievanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Grievance_referenceNo_key" ON "Grievance"("referenceNo");

-- CreateIndex
CREATE INDEX "Grievance_status_idx" ON "Grievance"("status");

-- CreateIndex
CREATE INDEX "Grievance_unitId_status_idx" ON "Grievance"("unitId", "status");

-- CreateIndex
CREATE INDEX "Grievance_createdById_idx" ON "Grievance"("createdById");

-- CreateIndex
CREATE INDEX "GrievanceEvent_grievanceId_createdAt_idx" ON "GrievanceEvent"("grievanceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grievance" ADD CONSTRAINT "Grievance_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrievanceEvent" ADD CONSTRAINT "GrievanceEvent_grievanceId_fkey" FOREIGN KEY ("grievanceId") REFERENCES "Grievance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
