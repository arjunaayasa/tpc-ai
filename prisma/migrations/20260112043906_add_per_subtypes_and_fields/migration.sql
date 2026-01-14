-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChunkType" ADD VALUE 'PARAGRAF';
ALTER TYPE "ChunkType" ADD VALUE 'LAMPIRAN';
ALTER TYPE "ChunkType" ADD VALUE 'LAMPIRAN_SECTION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentSubtype" ADD VALUE 'PER_NASKAH';
ALTER TYPE "DocumentSubtype" ADD VALUE 'PER_SALINDIA';

-- AlterTable
ALTER TABLE "RegulationChunk" ADD COLUMN     "paragraf" TEXT;
