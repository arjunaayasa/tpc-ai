import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { extractText } from '../lib/extraction';
import { extractMetadataFromText } from '../lib/heuristics';
import { redisUrl } from '../lib/queue';

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

        // 2. Extract text from file
        let text: string;
        try {
            text = await extractText(document.filePath, document.mimeType);
        } catch (extractError) {
            throw new Error(`Text extraction failed: ${(extractError as Error).message}`);
        }

        console.log(`[Worker] Extracted ${text.length} characters`);

        // 3. Run heuristics to extract metadata
        const extracted = extractMetadataFromText(text);
        console.log(`[Worker] Extracted metadata with confidence: ${extracted.confidence}`);

        // 4. Upsert metadata
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
                // Don't update updatedByUser on re-extraction
            },
        });

        // 5. Set status to needs_review
        await prisma.document.update({
            where: { id: documentId },
            data: { status: 'needs_review' },
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
