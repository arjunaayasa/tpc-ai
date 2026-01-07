-- Drop and recreate embedding column with correct dimension
ALTER TABLE "ChunkEmbedding" DROP COLUMN IF EXISTS embedding;
ALTER TABLE "ChunkEmbedding" ADD COLUMN embedding vector(768);
