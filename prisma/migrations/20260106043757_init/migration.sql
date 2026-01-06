-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'processing', 'needs_review', 'approved', 'failed');

-- CreateEnum
CREATE TYPE "RegulationType" AS ENUM ('UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RegulationStatus" AS ENUM ('berlaku', 'diubah', 'dicabut', 'unknown');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentMetadata" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "jenis" "RegulationType" NOT NULL DEFAULT 'UNKNOWN',
    "nomor" TEXT,
    "tahun" INTEGER,
    "judul" TEXT,
    "tanggalTerbit" TIMESTAMP(3),
    "tanggalBerlaku" TIMESTAMP(3),
    "statusAturan" "RegulationStatus" NOT NULL DEFAULT 'unknown',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extractionNotes" JSONB,
    "updatedByUser" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_sha256_key" ON "Document"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMetadata_documentId_key" ON "DocumentMetadata"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentMetadata" ADD CONSTRAINT "DocumentMetadata_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
