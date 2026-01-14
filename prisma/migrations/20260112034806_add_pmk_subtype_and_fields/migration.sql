-- CreateEnum
CREATE TYPE "DocumentSubtype" AS ENUM ('PMK_NASKAH', 'PMK_PUBLIKASI', 'BUKU_REFERENSI', 'BUKU_PANDUAN', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChunkType" ADD VALUE 'MENIMBANG';
ALTER TYPE "ChunkType" ADD VALUE 'MENGINGAT';
ALTER TYPE "ChunkType" ADD VALUE 'PENETAPAN';
ALTER TYPE "ChunkType" ADD VALUE 'BAGIAN';
ALTER TYPE "ChunkType" ADD VALUE 'HEADING_SECTION';
ALTER TYPE "ChunkType" ADD VALUE 'PENUTUP';

-- AlterTable
ALTER TABLE "DocumentMetadata" ADD COLUMN     "documentSubtype" "DocumentSubtype" NOT NULL DEFAULT 'UNKNOWN';

-- AlterTable
ALTER TABLE "RegulationChunk" ADD COLUMN     "bab" TEXT,
ADD COLUMN     "bagian" TEXT;
