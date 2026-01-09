-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "ChunkEmbedding" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "embedding" vector(768),
    "textHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChunkEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChunkEmbedding_chunkId_key" ON "ChunkEmbedding"("chunkId");

-- CreateIndex
CREATE INDEX "ChunkEmbedding_chunkId_idx" ON "ChunkEmbedding"("chunkId");

-- CreateIndex for vector similarity search (IVFFlat for approximate nearest neighbor)
CREATE INDEX "ChunkEmbedding_embedding_idx" ON "ChunkEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- AddForeignKey
ALTER TABLE "ChunkEmbedding" ADD CONSTRAINT "ChunkEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "RegulationChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
