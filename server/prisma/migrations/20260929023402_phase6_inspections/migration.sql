-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "scrutinyLevel" TEXT NOT NULL,
    "requiresInspection" BOOLEAN NOT NULL DEFAULT false,
    "factors" JSONB NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "riskScoreAtScheduling" INTEGER,
    "findings" TEXT,
    "complianceStatus" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionParticipant" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "inspectorId" TEXT,
    "observedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionObservation" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "compliant" BOOLEAN NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskAssessment_applicationId_key" ON "RiskAssessment"("applicationId");

-- CreateIndex
CREATE INDEX "Inspection_status_scheduledAt_idx" ON "Inspection"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Inspection_unitId_idx" ON "Inspection"("unitId");

-- CreateIndex
CREATE INDEX "Inspection_applicationId_idx" ON "Inspection"("applicationId");

-- CreateIndex
CREATE INDEX "InspectionParticipant_inspectorId_idx" ON "InspectionParticipant"("inspectorId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionParticipant_inspectionId_departmentId_key" ON "InspectionParticipant"("inspectionId", "departmentId");

-- CreateIndex
CREATE INDEX "InspectionObservation_inspectionId_idx" ON "InspectionObservation"("inspectionId");

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionParticipant" ADD CONSTRAINT "InspectionParticipant_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionParticipant" ADD CONSTRAINT "InspectionParticipant_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionParticipant" ADD CONSTRAINT "InspectionParticipant_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionObservation" ADD CONSTRAINT "InspectionObservation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionObservation" ADD CONSTRAINT "InspectionObservation_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "InspectionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
