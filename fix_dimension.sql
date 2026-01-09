-- Fix embedding dimension from 1024 to 768 for nomic-embed-text model
ALTER TABLE "ChunkEmbedding" DROP COLUMN IF EXISTS embedding;
ALTER TABLE "ChunkEmbedding" ADD COLUMN embedding vector(768);
