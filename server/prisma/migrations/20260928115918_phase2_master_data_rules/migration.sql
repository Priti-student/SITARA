-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Authority" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Authority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'any',
    "validityDays" INTEGER,
    "authorityId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequirement" (
    "id" TEXT NOT NULL,
    "approvalTypeId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,

    CONSTRAINT "ApprovalRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryRule" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "authorityName" TEXT NOT NULL,
    "authorityId" TEXT,
    "departmentId" TEXT,
    "approvalTypeId" TEXT,
    "conditions" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "requiredDocuments" JSONB NOT NULL DEFAULT '[]',
    "source" JSONB NOT NULL,
    "regulation" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "lastVerified" TIMESTAMP(3),
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Authority_name_key" ON "Authority"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalType_code_key" ON "ApprovalType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_code_key" ON "DocumentType"("code");

-- CreateIndex
CREATE INDEX "ApprovalRequirement_documentTypeId_idx" ON "ApprovalRequirement"("documentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequirement_approvalTypeId_documentTypeId_key" ON "ApprovalRequirement"("approvalTypeId", "documentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryRule_ruleId_key" ON "RegulatoryRule"("ruleId");

-- CreateIndex
CREATE INDEX "RegulatoryRule_isActive_ruleType_idx" ON "RegulatoryRule"("isActive", "ruleType");

-- CreateIndex
CREATE INDEX "RegulatoryRule_approvalTypeId_idx" ON "RegulatoryRule"("approvalTypeId");

-- AddForeignKey
ALTER TABLE "ApprovalType" ADD CONSTRAINT "ApprovalType_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "Authority"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalType" ADD CONSTRAINT "ApprovalType_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequirement" ADD CONSTRAINT "ApprovalRequirement_approvalTypeId_fkey" FOREIGN KEY ("approvalTypeId") REFERENCES "ApprovalType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequirement" ADD CONSTRAINT "ApprovalRequirement_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryRule" ADD CONSTRAINT "RegulatoryRule_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "Authority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryRule" ADD CONSTRAINT "RegulatoryRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryRule" ADD CONSTRAINT "RegulatoryRule_approvalTypeId_fkey" FOREIGN KEY ("approvalTypeId") REFERENCES "ApprovalType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
