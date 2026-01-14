-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChunkType" ADD VALUE 'ND_HEADER';
ALTER TYPE "ChunkType" ADD VALUE 'ND_PEMBUKA';
ALTER TYPE "ChunkType" ADD VALUE 'ND_ISI_ITEM';
ALTER TYPE "ChunkType" ADD VALUE 'ND_SUB_ITEM';
ALTER TYPE "ChunkType" ADD VALUE 'ND_SUB_SUB_ITEM';
ALTER TYPE "ChunkType" ADD VALUE 'ND_PENEGASAN';
ALTER TYPE "ChunkType" ADD VALUE 'ND_PENUTUP';
ALTER TYPE "ChunkType" ADD VALUE 'ND_LAMPIRAN_SECTION';

-- AlterEnum
ALTER TYPE "RegulationType" ADD VALUE 'NOTA_DINAS';
