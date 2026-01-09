-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PERATURAN', 'PUTUSAN');

-- CreateEnum
CREATE TYPE "ChunkType" AS ENUM ('PREAMBLE', 'PASAL', 'AYAT', 'SECTION', 'SUBSECTION', 'EVIDENCE', 'AMAR');

-- CreateEnum
CREATE TYPE "ChunkRole" AS ENUM ('MAJELIS', 'PEMOHON', 'TERBANDING', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "RegulationType" ADD VALUE 'PUTUSAN';

-- DropIndex
DROP INDEX "ChunkEmbedding_embedding_idx";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "docType" "DocumentType" NOT NULL DEFAULT 'PERATURAN';

-- AlterTable
ALTER TABLE "RegulationChunk" ADD COLUMN     "chunkType" "ChunkType" NOT NULL DEFAULT 'PASAL',
ADD COLUMN     "legalRefs" JSONB,
ADD COLUMN     "parentChunkId" TEXT,
ADD COLUMN     "role" "ChunkRole" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "RegulationChunk_documentId_chunkType_idx" ON "RegulationChunk"("documentId", "chunkType");
