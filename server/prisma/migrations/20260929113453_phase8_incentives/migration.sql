-- CreateTable
CREATE TABLE "IncentiveScheme" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "department" TEXT,
    "benefitType" TEXT NOT NULL,
    "benefitSummary" TEXT NOT NULL,
    "maxAmountInr" INTEGER,
    "eligibility" JSONB NOT NULL,
    "requiredDocuments" JSONB NOT NULL DEFAULT '[]',
    "opensOn" TIMESTAMP(3),
    "closesOn" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveClaim" (
    "id" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "requestedAmountInr" INTEGER NOT NULL,
    "approvedAmountInr" INTEGER,
    "eligibility" JSONB NOT NULL,
    "notes" TEXT,
    "decisionNotes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "disbursementRef" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "utilisationNotes" TEXT,
    "utilisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveClaimEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL DEFAULT 'system',
    "actorRole" TEXT NOT NULL DEFAULT 'SYSTEM',
    "eventType" TEXT NOT NULL,
    "comment" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentiveClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveScheme_code_key" ON "IncentiveScheme"("code");

-- CreateIndex
CREATE INDEX "IncentiveScheme_active_category_idx" ON "IncentiveScheme"("active", "category");

-- CreateIndex
CREATE INDEX "IncentiveClaim_unitId_status_idx" ON "IncentiveClaim"("unitId", "status");

-- CreateIndex
CREATE INDEX "IncentiveClaim_schemeId_status_idx" ON "IncentiveClaim"("schemeId", "status");

-- CreateIndex
CREATE INDEX "IncentiveClaim_status_idx" ON "IncentiveClaim"("status");

-- CreateIndex
CREATE INDEX "IncentiveClaimEvent_claimId_createdAt_idx" ON "IncentiveClaimEvent"("claimId", "createdAt");

-- AddForeignKey
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "IncentiveScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveClaim" ADD CONSTRAINT "IncentiveClaim_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveClaimEvent" ADD CONSTRAINT "IncentiveClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "IncentiveClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

