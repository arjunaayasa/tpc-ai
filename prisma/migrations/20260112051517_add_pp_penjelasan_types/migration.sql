-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChunkType" ADD VALUE 'PENJELASAN_UMUM';
ALTER TYPE "ChunkType" ADD VALUE 'PENJELASAN_PASAL';
ALTER TYPE "ChunkType" ADD VALUE 'PENJELASAN_AYAT';

-- AlterTable
ALTER TABLE "RegulationChunk" ADD COLUMN     "sourcePart" TEXT;
