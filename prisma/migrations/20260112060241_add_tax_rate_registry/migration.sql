-- CreateEnum
CREATE TYPE "TaxRateType" AS ENUM ('FLAT', 'PROGRESSIVE', 'MATRIX');

-- CreateEnum
CREATE TYPE "TaxBaseType" AS ENUM ('GROSS', 'NET', 'DPP', 'NILAI_IMPOR', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "TaxRateCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRateCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRateRule" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectCode" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'ID',
    "rateType" "TaxRateType" NOT NULL,
    "baseType" "TaxBaseType" NOT NULL DEFAULT 'GROSS',
    "rateValue" DECIMAL(65,30),
    "multiplier" DECIMAL(65,30),
    "conditions" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "sourceRef" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRateRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRateBracket" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "minAmount" DECIMAL(65,30) NOT NULL,
    "maxAmount" DECIMAL(65,30),
    "rate" DECIMAL(65,30) NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRateBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRateAudit" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRateAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxRateCategory_code_key" ON "TaxRateCategory"("code");

-- CreateIndex
CREATE INDEX "TaxRateRule_categoryId_isActive_idx" ON "TaxRateRule"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "TaxRateRule_objectCode_idx" ON "TaxRateRule"("objectCode");

-- CreateIndex
CREATE INDEX "TaxRateRule_effectiveFrom_effectiveTo_idx" ON "TaxRateRule"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRateRule_categoryId_objectCode_effectiveFrom_key" ON "TaxRateRule"("categoryId", "objectCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "TaxRateBracket_ruleId_orderIndex_idx" ON "TaxRateBracket"("ruleId", "orderIndex");

-- CreateIndex
CREATE INDEX "TaxRateAudit_entityType_entityId_idx" ON "TaxRateAudit"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "TaxRateAudit_createdAt_idx" ON "TaxRateAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "TaxRateRule" ADD CONSTRAINT "TaxRateRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaxRateCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRateBracket" ADD CONSTRAINT "TaxRateBracket_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TaxRateRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
