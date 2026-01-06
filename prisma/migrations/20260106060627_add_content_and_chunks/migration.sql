-- CreateTable
CREATE TABLE "DocumentContent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "textHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulationChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "anchorCitation" TEXT NOT NULL,
    "pasal" TEXT,
    "ayat" TEXT,
    "huruf" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "tokenEstimate" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulationChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentContent_documentId_key" ON "DocumentContent"("documentId");

-- CreateIndex
CREATE INDEX "RegulationChunk_documentId_orderIndex_idx" ON "RegulationChunk"("documentId", "orderIndex");

-- CreateIndex
CREATE INDEX "RegulationChunk_documentId_pasal_idx" ON "RegulationChunk"("documentId", "pasal");

-- AddForeignKey
ALTER TABLE "DocumentContent" ADD CONSTRAINT "DocumentContent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulationChunk" ADD CONSTRAINT "RegulationChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
