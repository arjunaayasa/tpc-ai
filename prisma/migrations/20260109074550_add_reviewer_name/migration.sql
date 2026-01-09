-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChunkType" ADD VALUE 'BAB';
ALTER TYPE "ChunkType" ADD VALUE 'SUBBAB';

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'BUKU';

-- AlterEnum
ALTER TYPE "RegulationType" ADD VALUE 'BUKU';

-- AlterTable
ALTER TABLE "DocumentMetadata" ADD COLUMN     "reviewerName" TEXT;
