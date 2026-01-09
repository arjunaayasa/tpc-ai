-- CreateTable
CREATE TABLE "DocumentTable" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pageContext" TEXT,
    "headers" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "notes" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTable_documentId_idx" ON "DocumentTable"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentTable" ADD CONSTRAINT "DocumentTable_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
