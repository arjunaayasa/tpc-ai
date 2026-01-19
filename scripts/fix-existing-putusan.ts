
import { PrismaClient, ChunkType } from '@prisma/client';
import { parsePutusan, putusanChunkToDbFormat } from '../src/lib/extractors/putusanExtractor';
import { extractText } from '../src/lib/extraction';
import { embedTexts, hashText } from '../src/lib/embeddings';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('=== FIXING EXISTING PUTUSAN DOCUMENTS (FRESH RUN) ===\n');

    const activeDocs = await prisma.document.findMany({
        where: { isActiveForRAG: true } as any,
        select: { id: true, originalName: true, filePath: true, mimeType: true }
    });

    console.log(`Found ${activeDocs.length} active documents.`);

    for (const doc of activeDocs) {
        console.log(`\nProcessing: ${doc.originalName} (${doc.id})`);

        if (!doc.filePath || !fs.existsSync(doc.filePath)) {
            console.error(`  ERROR: File not found at ${doc.filePath}`);
            continue;
        }

        // 2. Extract Text
        console.log(`  Checking text availability...`);
        let textToProcess = '';

        try {
            const cachedContent = await prisma.documentContent.findUnique({
                where: { documentId: doc.id }
            });

            if (cachedContent && cachedContent.fullText.length > 100) {
                console.log(`  Using cached content from DB (${cachedContent.fullText.length} chars).`);
                textToProcess = cachedContent.fullText;
            } else {
                console.log(`  Extracting text from ${doc.mimeType}...`);
                textToProcess = await extractText(doc.filePath, doc.mimeType);

                // Cache it
                if (textToProcess && textToProcess.length > 100) {
                    await prisma.documentContent.upsert({
                        where: { documentId: doc.id },
                        create: { documentId: doc.id, fullText: textToProcess },
                        update: { fullText: textToProcess }
                    });
                }
            }
        } catch (e) {
            console.error('  Text retrieval failed:', e);
        }

        if (!textToProcess || textToProcess.length < 100) {
            console.error('  ERROR: Extracted text is empty or too short');
            continue;
        }
        console.log(`  Extracted ${textToProcess.length} chars.`);

        // 3. Parse with NEW logic
        console.log('  Parsing with new chunking logic...');
        if (!doc.originalName.toUpperCase().includes('PUT') && !textToProcess.includes('PENGADILAN PAJAK')) {
            console.warn('  WARNING: Does not look like a Putusan. Skipping.');
            continue;
        }

        const parsed = parsePutusan(textToProcess);
        const newChunks = parsed.chunks.map(chunk => {
            const mapped = putusanChunkToDbFormat(chunk);
            return {
                ...mapped,
                documentId: doc.id,
                legalRefs: mapped.legalRefs as any
            };
        });

        console.log(`  Generated ${newChunks.length} new chunks.`);

        // 4. Update Database Transactionally
        console.log('  Updating database...');
        try {
            await prisma.$transaction(async (tx) => {
                const deleted = await tx.regulationChunk.deleteMany({
                    where: { documentId: doc.id }
                });
                console.log(`    Deleted ${deleted.count} old chunks.`);

                if (newChunks.length > 0) {
                    await tx.regulationChunk.createMany({
                        data: newChunks
                    });
                    console.log(`    Inserted ${newChunks.length} new chunks.`);
                }
            });
        } catch (e) {
            console.error('  Transaction failed:', e);
            continue;
        }

        // 5. Generate Embeddings
        console.log('  Generating embeddings...');
        const createdChunks = await prisma.regulationChunk.findMany({
            where: { documentId: doc.id },
            select: { id: true, text: true }
        });

        if (createdChunks.length > 0) {
            const texts = createdChunks.map(c => c.text);
            try {
                const BATCH_SIZE = 10;
                for (let i = 0; i < texts.length; i += BATCH_SIZE) {
                    const batchTexts = texts.slice(i, i + BATCH_SIZE);
                    const batchChunks = createdChunks.slice(i, i + BATCH_SIZE);

                    const embeddings = await embedTexts(batchTexts);

                    for (let j = 0; j < batchChunks.length; j++) {
                        const chunk = batchChunks[j];
                        const embedding = embeddings[j];
                        const textHash = hashText(chunk.text);

                        await prisma.$executeRaw`
                            INSERT INTO "ChunkEmbedding" ("id", "chunkId", "embedding", "textHash", "modelName", "createdAt", "updatedAt")
                            VALUES (gen_random_uuid(), ${chunk.id}, ${embedding}::vector, ${textHash}, 'text-embedding-3-small', NOW(), NOW())
                            ON CONFLICT ("chunkId") DO UPDATE SET
                            "embedding" = ${embedding}::vector,
                            "textHash" = ${textHash},
                            "modelName" = 'text-embedding-3-small',
                            "updatedAt" = NOW();
                        `;
                    }
                    console.log(`    Embedded batch ${Math.ceil((i + 1) / BATCH_SIZE)}/${Math.ceil(texts.length / BATCH_SIZE)}`);
                }
            } catch (err) {
                console.error('    Embedding failed:', err);
            }
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
