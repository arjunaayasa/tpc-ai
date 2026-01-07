import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { extractText } from '../lib/extraction';
import { extractMetadataFromText } from '../lib/heuristics';
import { chunkByPasal, hashText } from '../lib/chunking';
import { redisUrl } from '../lib/queue';
import { embedTexts, hashText as embedHashText, EMBEDDING_MODEL } from '../lib/embeddings';

const prisma = new PrismaClient();

// Parse Redis URL for connection options
function parseRedisUrl(url: string): { host: string; port: number } {
    const parsed = new URL(url);
    return {
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port, 10) || 6379,
    };
}

interface ExtractMetadataJobData {
    documentId: string;
}

/**
 * Generate embeddings for all chunks of a document
 * Only generates embeddings for chunks that are new or have changed text
 */
async function generateChunkEmbeddings(documentId: string): Promise<void> {
    // Get all chunks for this document
    const chunks = await prisma.regulationChunk.findMany({
        where: { documentId },
        select: {
            id: true,
            text: true,
            embedding: {
                select: {
                    id: true,
                    textHash: true,
                },
            },
        },
    });

    if (chunks.length === 0) {
        console.log(`[Worker] No chunks to embed for document ${documentId}`);
        return;
    }

    // Find chunks that need embedding (new or changed text)
    const chunksToEmbed: { id: string; text: string; textHash: string }[] = [];
    
    for (const chunk of chunks) {
        const currentTextHash = embedHashText(chunk.text);
        const existingEmbedding = chunk.embedding;
        
        if (!existingEmbedding || existingEmbedding.textHash !== currentTextHash) {
            chunksToEmbed.push({
                id: chunk.id,
                text: chunk.text,
                textHash: currentTextHash,
            });
        }
    }

    if (chunksToEmbed.length === 0) {
        console.log(`[Worker] All chunks already have up-to-date embeddings`);
        return;
    }

    console.log(`[Worker] Generating embeddings for ${chunksToEmbed.length} chunks...`);

    // Generate embeddings in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < chunksToEmbed.length; i += BATCH_SIZE) {
        const batch = chunksToEmbed.slice(i, i + BATCH_SIZE);
        const texts = batch.map(c => c.text);
        
        console.log(`[Worker] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunksToEmbed.length / BATCH_SIZE)}`);
        
        const embeddings = await embedTexts(texts);
        
        // Upsert embeddings one by one using raw SQL for vector type
        for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];
            const embedding = embeddings[j];
            const vectorString = `[${embedding.join(',')}]`;
            
            // Check if embedding exists
            const existing = await prisma.chunkEmbedding.findUnique({
                where: { chunkId: chunk.id },
            });
            
            if (existing) {
                // Update existing embedding
                await prisma.$executeRaw`
                    UPDATE "ChunkEmbedding" 
                    SET embedding = ${vectorString}::vector,
                        "textHash" = ${chunk.textHash},
                        "modelName" = ${EMBEDDING_MODEL},
                        "updatedAt" = NOW()
                    WHERE "chunkId" = ${chunk.id}
                `;
            } else {
                // Insert new embedding
                const id = crypto.randomUUID();
                await prisma.$executeRaw`
                    INSERT INTO "ChunkEmbedding" (id, "chunkId", "modelName", embedding, "textHash", "createdAt", "updatedAt")
                    VALUES (${id}, ${chunk.id}, ${EMBEDDING_MODEL}, ${vectorString}::vector, ${chunk.textHash}, NOW(), NOW())
                `;
            }
        }
    }

    console.log(`[Worker] Completed embedding generation for ${chunksToEmbed.length} chunks`);
}

async function processExtractMetadata(job: Job<ExtractMetadataJobData>): Promise<void> {
    const { documentId } = job.data;
    console.log(`[Worker] Processing document: ${documentId}`);

    try {
        // 1. Set status to processing
        const document = await prisma.document.update({
            where: { id: documentId },
            data: { status: 'processing', lastError: null },
        });

        console.log(`[Worker] Reading file: ${document.filePath}`);

        // 2. Extract full text from file
        let fullText: string;
        try {
            fullText = await extractText(document.filePath, document.mimeType);
        } catch (extractError) {
            throw new Error(`Text extraction failed: ${(extractError as Error).message}`);
        }

        console.log(`[Worker] Extracted ${fullText.length} characters`);

        // 3. Save fullText to DocumentContent
        const textHash = hashText(fullText);
        await prisma.documentContent.upsert({
            where: { documentId },
            create: {
                documentId,
                fullText,
                textHash,
            },
            update: {
                fullText,
                textHash,
            },
        });
        console.log(`[Worker] Saved fullText to DocumentContent`);

        // 4. Run heuristics to extract metadata
        const extracted = extractMetadataFromText(fullText);
        console.log(`[Worker] Extracted metadata with confidence: ${extracted.confidence}`);

        // 5. Upsert metadata
        await prisma.documentMetadata.upsert({
            where: { documentId },
            create: {
                documentId,
                jenis: extracted.jenis,
                nomor: extracted.nomor,
                tahun: extracted.tahun,
                judul: extracted.judul,
                tanggalTerbit: extracted.tanggalTerbit,
                tanggalBerlaku: extracted.tanggalBerlaku,
                statusAturan: extracted.statusAturan,
                confidence: extracted.confidence,
                extractionNotes: extracted.extractionNotes as object,
                updatedByUser: false,
            },
            update: {
                jenis: extracted.jenis,
                nomor: extracted.nomor,
                tahun: extracted.tahun,
                judul: extracted.judul,
                tanggalTerbit: extracted.tanggalTerbit,
                tanggalBerlaku: extracted.tanggalBerlaku,
                statusAturan: extracted.statusAturan,
                confidence: extracted.confidence,
                extractionNotes: extracted.extractionNotes as object,
            },
        });

        // 6. Delete existing chunks for idempotency
        await prisma.regulationChunk.deleteMany({
            where: { documentId },
        });
        console.log(`[Worker] Deleted old chunks`);

        // 7. Parse and create chunks by Pasal
        const chunks = chunkByPasal(fullText, {
            jenis: extracted.jenis,
            nomor: extracted.nomor,
            tahun: extracted.tahun,
        });
        console.log(`[Worker] Parsed ${chunks.length} chunks`);
        
        // Debug: log chunk details
        chunks.forEach((chunk, idx) => {
            console.log(`[Worker] Chunk ${idx}: Pasal ${chunk.pasal || 'Pembukaan'}, ${chunk.text.length} chars, ${chunk.tokenEstimate} tokens`);
            // Log first 100 chars of each chunk for debugging
            console.log(`[Worker] Chunk ${idx} preview: ${chunk.text.substring(0, 100).replace(/\n/g, ' ')}...`);
        });

        // 8. Bulk insert chunks
        if (chunks.length > 0) {
            await prisma.regulationChunk.createMany({
                data: chunks.map((chunk) => ({
                    documentId,
                    anchorCitation: chunk.anchorCitation,
                    pasal: chunk.pasal,
                    ayat: chunk.ayat,
                    huruf: chunk.huruf,
                    orderIndex: chunk.orderIndex,
                    text: chunk.text,
                    tokenEstimate: chunk.tokenEstimate,
                })),
            });
            console.log(`[Worker] Inserted ${chunks.length} chunks`);
        }

        // 9. Generate embeddings for chunks
        let embeddingWarning: string | null = null;
        try {
            await generateChunkEmbeddings(documentId);
            console.log(`[Worker] Generated embeddings for document ${documentId}`);
        } catch (embeddingError) {
            // Don't fail the whole process, just log warning
            embeddingWarning = `Embedding generation failed: ${(embeddingError as Error).message}`;
            console.warn(`[Worker] ${embeddingWarning}`);
        }

        // 10. Set status to needs_review
        await prisma.document.update({
            where: { id: documentId },
            data: { 
                status: 'needs_review',
                lastError: embeddingWarning,
            },
        });

        console.log(`[Worker] Document ${documentId} processed successfully`);
    } catch (error) {
        console.error(`[Worker] Error processing document ${documentId}:`, error);

        // Set status to failed with error message
        await prisma.document.update({
            where: { id: documentId },
            data: {
                status: 'failed',
                lastError: (error as Error).message || 'Unknown error',
            },
        });

        throw error; // Re-throw to mark job as failed
    }
}

// Create worker
const { host, port } = parseRedisUrl(redisUrl);
const worker = new Worker<ExtractMetadataJobData>('extraction', processExtractMetadata, {
    connection: {
        host,
        port,
        maxRetriesPerRequest: null,
    },
    concurrency: 2,
});

worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
    console.error('[Worker] Error:', err);
});

console.log('[Worker] Started and listening for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Worker] Shutting down...');
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[Worker] Shutting down...');
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
});
