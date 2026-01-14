import { Worker, Job } from 'bullmq';
import { PrismaClient, ChunkType } from '@prisma/client';
import { extractText } from '../lib/extraction';
import { extractMetadataFromText } from '../lib/heuristics';
import { chunkByPasal, hashText } from '../lib/chunking';
import { parsePutusan, putusanChunkToDbFormat, extractPutusanIdentity } from '../lib/extractors/putusanExtractor';
import { parseBuku, bukuChunkToDbFormat, extractBukuIdentity } from '../lib/extractors/bukuExtractor';
import { parseBookWithAI, isAIChunkingAvailable, BookChunk } from '../lib/ai/bookChunker';
import { parsePMK, classifyPMK, pmkChunkToDbFormat, PmkChunk } from '../lib/extractors/pmk';
import { parsePER, classifyPER, perChunkToDbFormat, PerSubtype } from '../lib/extractors/per';
import { parsePP, ppChunkToDbFormat } from '../lib/extractors/pp';
import { parseSE, seChunkToDbFormat } from '../lib/extractors/se';
import { parseNotaDinas, notaDinasChunkToDbFormat } from '../lib/extractors/nota-dinas';
import { parsePerpu, perpuChunkToDbFormat } from '../lib/extractors/perpu';
import { parseUu, uuChunkToDbFormat } from '../lib/extractors/uu';
import { redisUrl } from '../lib/queue';
import { embedTexts, hashText as embedHashText, EMBEDDING_MODEL } from '../lib/embeddings';
import { extractTablesFromText } from '../lib/ai/qwen';

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
    forceType?: string; // Optional forced document type (overrides heuristic detection)
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
        console.log(`[Worker] Got ${embeddings.length} embeddings, dimensions: ${embeddings[0]?.length || 'N/A'}`);

        // Upsert embeddings one by one using raw SQL for vector type
        for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];
            const embedding = embeddings[j];

            // Validate embedding exists and has dimensions
            if (!embedding || embedding.length === 0) {
                console.error(`[Worker] Empty embedding for chunk ${chunk.id}, skipping...`);
                continue;
            }

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
    const { documentId, forceType } = job.data;
    console.log(`[Worker] Processing document: ${documentId}${forceType ? ` (forced type: ${forceType})` : ''}`);

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
        // First, extract basic metadata to detect document type
        // Pass filename for improved type detection
        const extracted = extractMetadataFromText(fullText, document.originalName);
        console.log(`[Worker] Extracted metadata with confidence: ${extracted.confidence}`);

        // Determine document type - forceType takes highest priority, then user selection, then heuristics
        // If forceType is provided, use it to override all detection INCLUDING document.docType
        const effectiveJenis = forceType || extracted.jenis;

        // When forceType is provided, ignore document.docType completely for routing
        // This allows users to change types (e.g., from PUTUSAN to UU) via the UI
        const isPMK = effectiveJenis === 'PMK';
        const isPER = effectiveJenis === 'PER';
        const isPP = effectiveJenis === 'PP';
        const isPERPU = effectiveJenis === 'PERPU';
        const isSE = effectiveJenis === 'SE';
        const isNotaDinas = effectiveJenis === 'NOTA_DINAS';
        const isBuku = effectiveJenis === 'BUKU' || document.docType === 'BUKU';
        const isPutusan = effectiveJenis === 'PUTUSAN' || (!forceType && document.docType === 'PUTUSAN');
        const isUU = effectiveJenis === 'UU';
        console.log(`[Worker] Document type: docType=${document.docType}, jenis=${effectiveJenis}${forceType ? ' (forced)' : ''}, isPMK=${isPMK}, isPER=${isPER}, isPP=${isPP}, isPERPU=${isPERPU}, isSE=${isSE}, isNotaDinas=${isNotaDinas}, isBuku=${isBuku}, isPutusan=${isPutusan}, isUU=${isUU}`);

        if (isPMK) {
            // PMK: use specialized PMK extractor
            console.log(`[Worker] Processing as PMK document`);

            // Classify PMK subtype (NASKAH vs PUBLIKASI)
            const subtype = classifyPMK(fullText);
            console.log(`[Worker] PMK classified as: ${subtype}`);

            // Parse PMK with appropriate extractor
            const pmkResult = parsePMK(fullText, subtype);
            console.log(`[Worker] PMK parsed: ${pmkResult.chunks.length} chunks, identity: ${JSON.stringify(pmkResult.identity)}`);

            // Convert date strings to Date objects if present
            let tanggalTerbit: Date | null = null;
            let tanggalBerlaku: Date | null = null;
            if (pmkResult.identity.tanggalTerbit) {
                try {
                    // Parse Indonesian date format like "29 Desember 2023"
                    const dateStr = pmkResult.identity.tanggalTerbit;
                    const months: Record<string, number> = {
                        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
                        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
                    };
                    const match = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/);
                    if (match) {
                        const day = parseInt(match[1], 10);
                        const month = months[match[2].toLowerCase()];
                        const year = parseInt(match[3], 10);
                        if (month !== undefined) {
                            tanggalTerbit = new Date(year, month, day);
                        }
                    }
                } catch (e) {
                    console.warn(`[Worker] Failed to parse tanggalTerbit: ${e}`);
                }
            }

            // Upsert metadata with PMK info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'PMK',
                    documentSubtype: subtype,
                    nomor: pmkResult.identity.nomor,
                    tahun: pmkResult.identity.tahun,
                    judul: pmkResult.identity.tentang,
                    tanggalTerbit,
                    tanggalBerlaku,
                    confidence: pmkResult.identity.nomor ? 0.9 : 0.7,
                    extractionNotes: {
                        docType: 'PMK',
                        subtype,
                        sectionCount: pmkResult.sections.length,
                        chunkCount: pmkResult.chunks.length,
                        legalRefs: pmkResult.legalRefs,
                    },
                    updatedByUser: false,
                },
                update: {
                    jenis: 'PMK',
                    documentSubtype: subtype,
                    nomor: pmkResult.identity.nomor,
                    tahun: pmkResult.identity.tahun,
                    judul: pmkResult.identity.tentang,
                    tanggalTerbit,
                    tanggalBerlaku,
                    confidence: pmkResult.identity.nomor ? 0.9 : 0.7,
                    extractionNotes: {
                        docType: 'PMK',
                        subtype,
                        sectionCount: pmkResult.sections.length,
                        chunkCount: pmkResult.chunks.length,
                        legalRefs: pmkResult.legalRefs,
                    },
                },
            });

            // Delete existing chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert PMK chunks
            if (pmkResult.chunks.length > 0) {
                const chunkData = pmkResult.chunks.map(chunk => {
                    const dbChunk = pmkChunkToDbFormat(chunk);
                    return {
                        documentId,
                        anchorCitation: dbChunk.anchorCitation,
                        pasal: dbChunk.pasal,
                        ayat: dbChunk.ayat,
                        huruf: dbChunk.huruf,
                        bab: dbChunk.bab,
                        bagian: dbChunk.bagian,
                        chunkType: dbChunk.chunkType as 'PREAMBLE' | 'PASAL' | 'AYAT' | 'SECTION' | 'SUBSECTION' | 'EVIDENCE' | 'AMAR' | 'BAB' | 'SUBBAB' | 'MENIMBANG' | 'MENGINGAT' | 'PENETAPAN' | 'BAGIAN' | 'HEADING_SECTION' | 'PENUTUP',
                        role: dbChunk.role as 'MAJELIS' | 'PEMOHON' | 'TERBANDING' | 'UNKNOWN',
                        title: dbChunk.title,
                        parentChunkId: dbChunk.parentChunkId,
                        legalRefs: dbChunk.legalRefs ?? undefined,
                        orderIndex: dbChunk.orderIndex,
                        text: dbChunk.text,
                        tokenEstimate: dbChunk.tokenEstimate,
                    };
                });
                await prisma.regulationChunk.createMany({
                    data: chunkData,
                });
                console.log(`[Worker] Inserted ${pmkResult.chunks.length} PMK chunks`);
            }

            // Log chunk summary
            console.log(`[Worker] PMK chunk types breakdown:`);
            const typeCounts = pmkResult.chunks.reduce((acc, c) => {
                acc[c.chunkType] = (acc[c.chunkType] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            Object.entries(typeCounts).forEach(([type, count]) => {
                console.log(`[Worker]   - ${type}: ${count}`);
            });

            // Extract tables from PMK using Qwen AI
            try {
                console.log(`[Worker] Extracting tables from PMK using Qwen AI...`);
                const tableResult = await extractTablesFromText(fullText, `PMK ${pmkResult.identity.nomor || 'Unknown'}`);

                if (tableResult.tables.length > 0) {
                    // Delete existing tables
                    await prisma.documentTable.deleteMany({
                        where: { documentId },
                    });

                    // Insert extracted tables into DocumentTable
                    await prisma.documentTable.createMany({
                        data: tableResult.tables.map((table, idx) => ({
                            documentId,
                            title: table.title,
                            pageContext: table.pageContext ?? null,
                            headers: table.headers,
                            rows: table.rows,
                            notes: table.notes ?? null,
                            orderIndex: idx,
                        })),
                    });

                    // Also create RegulationChunk entries for RAG search
                    const tableChunks = tableResult.tables.map((table, idx) => {
                        // Convert table to markdown table format for better display
                        const headerRow = `| ${table.headers.join(' | ')} |`;
                        const separatorRow = `| ${table.headers.map(() => '---').join(' | ')} |`;
                        const dataRows = table.rows.map(row => `| ${row.cells.join(' | ')} |`).join('\n');
                        const tableText = `## ${table.title}\n\n${headerRow}\n${separatorRow}\n${dataRows}${table.notes ? `\n\n**Catatan:** ${table.notes}` : ''}`;

                        return {
                            documentId,
                            chunkType: ChunkType.TABLE,
                            text: tableText,
                            anchorCitation: `${pmkResult.identity.nomor || 'PMK'} - Tabel ${idx + 1}: ${table.title}`,
                            orderIndex: 1000 + idx, // Put tables after regular chunks
                            tokenEstimate: Math.ceil(tableText.length / 4),
                        };
                    });

                    await prisma.regulationChunk.createMany({
                        data: tableChunks,
                    });

                    console.log(`[Worker] Inserted ${tableResult.tables.length} tables from PMK (as DocumentTable + TABLE chunks)`);
                } else {
                    console.log(`[Worker] No tables found in PMK`);
                }
            } catch (tableError) {
                console.error(`[Worker] Table extraction failed (non-critical):`, tableError);
                // Continue without tables - non-critical error
            }
        } else if (isPER) {
            // PER: use specialized PER extractor
            console.log(`[Worker] Processing as PER document`);

            // Classify PER subtype (NASKAH vs SALINDIA)
            const subClassification = classifyPER(fullText);
            const perSubtype = subClassification.subtype;
            console.log(`[Worker] PER classified as: ${perSubtype}`);

            // Parse PER with appropriate extractor
            const perResult = parsePER(fullText, perSubtype);
            console.log(`[Worker] PER parsed: ${perResult.chunks.length} chunks, identity: ${JSON.stringify(perResult.identity)}`);

            // Convert date strings to Date objects if present
            let tanggalTerbit: Date | null = null;
            let tanggalBerlaku: Date | null = null;
            if (perResult.identity.tanggalTerbit) {
                try {
                    const dateStr = perResult.identity.tanggalTerbit;
                    const months: Record<string, number> = {
                        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
                        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
                    };
                    const match = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/);
                    if (match) {
                        const day = parseInt(match[1], 10);
                        const month = months[match[2].toLowerCase()];
                        const year = parseInt(match[3], 10);
                        if (month !== undefined) {
                            tanggalTerbit = new Date(year, month, day);
                        }
                    }
                } catch (e) {
                    console.warn(`[Worker] Failed to parse PER tanggalTerbit: ${e}`);
                }
            }

            // Upsert metadata with PER info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'PER',
                    nomor: perResult.identity.nomor ?? null,
                    tahun: perResult.identity.tahun ?? null,
                    judul: perResult.identity.tentang ?? null,
                    tanggalTerbit,
                    tanggalBerlaku,
                    statusAturan: 'berlaku',
                    documentSubtype: perSubtype,
                    confidence: subClassification.confidence,
                    extractionNotes: { subtype: perSubtype, reasons: subClassification.reasons },
                },
                update: {
                    jenis: 'PER',
                    nomor: perResult.identity.nomor ?? null,
                    tahun: perResult.identity.tahun ?? null,
                    judul: perResult.identity.tentang ?? null,
                    tanggalTerbit,
                    tanggalBerlaku,
                    documentSubtype: perSubtype,
                    confidence: subClassification.confidence,
                    extractionNotes: { subtype: perSubtype, reasons: subClassification.reasons },
                },
            });

            // Delete old chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert PER chunks
            if (perResult.chunks.length > 0) {
                const chunkData = perResult.chunks.map(chunk => {
                    const dbChunk = perChunkToDbFormat(chunk);
                    return {
                        documentId,
                        anchorCitation: dbChunk.anchorCitation,
                        pasal: dbChunk.pasal,
                        ayat: dbChunk.ayat,
                        huruf: dbChunk.huruf,
                        bab: dbChunk.bab,
                        bagian: dbChunk.bagian,
                        paragraf: dbChunk.paragraf,
                        chunkType: dbChunk.chunkType as any,
                        role: dbChunk.role as any,
                        title: dbChunk.title,
                        parentChunkId: dbChunk.parentChunkId,
                        legalRefs: dbChunk.legalRefs ?? undefined,
                        orderIndex: dbChunk.orderIndex,
                        text: dbChunk.text,
                        tokenEstimate: dbChunk.tokenEstimate,
                    };
                });
                await prisma.regulationChunk.createMany({
                    data: chunkData,
                });
                console.log(`[Worker] Inserted ${perResult.chunks.length} PER chunks`);
            }

            // Log chunk summary
            console.log(`[Worker] PER chunk types breakdown:`);
            const typeCounts = perResult.chunks.reduce((acc, c) => {
                acc[c.chunkType] = (acc[c.chunkType] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            Object.entries(typeCounts).forEach(([type, count]) => {
                console.log(`[Worker]   - ${type}: ${count}`);
            });

            // Extract tables from PER using Qwen AI
            try {
                console.log(`[Worker] Extracting tables from PER using Qwen AI...`);
                const tableResult = await extractTablesFromText(fullText, `PER ${perResult.identity.nomor || 'Unknown'}`);

                if (tableResult.tables.length > 0) {
                    await prisma.documentTable.deleteMany({
                        where: { documentId },
                    });

                    await prisma.documentTable.createMany({
                        data: tableResult.tables.map((table, idx) => ({
                            documentId,
                            title: table.title,
                            pageContext: table.pageContext ?? null,
                            headers: table.headers,
                            rows: table.rows,
                            notes: table.notes ?? null,
                            orderIndex: idx,
                        })),
                    });

                    // Also create RegulationChunk entries for RAG search
                    const tableChunks = tableResult.tables.map((table, idx) => {
                        // Convert table to markdown table format for better display
                        const headerRow = `| ${table.headers.join(' | ')} |`;
                        const separatorRow = `| ${table.headers.map(() => '---').join(' | ')} |`;
                        const dataRows = table.rows.map(row => `| ${row.cells.join(' | ')} |`).join('\n');
                        const tableText = `## ${table.title}\n\n${headerRow}\n${separatorRow}\n${dataRows}${table.notes ? `\n\n**Catatan:** ${table.notes}` : ''}`;

                        return {
                            documentId,
                            chunkType: ChunkType.TABLE,
                            text: tableText,
                            anchorCitation: `${perResult.identity.nomor || 'PER'} - Tabel ${idx + 1}: ${table.title}`,
                            orderIndex: 1000 + idx,
                            tokenEstimate: Math.ceil(tableText.length / 4),
                        };
                    });

                    await prisma.regulationChunk.createMany({
                        data: tableChunks,
                    });

                    console.log(`[Worker] Inserted ${tableResult.tables.length} tables from PER (as DocumentTable + TABLE chunks)`);
                } else {
                    console.log(`[Worker] No tables found in PER`);
                }
            } catch (tableError) {
                console.error(`[Worker] Table extraction failed (non-critical):`, tableError);
            }
        } else if (isPP) {
            // PP: use specialized PP extractor
            console.log(`[Worker] Processing as PP document`);

            // Parse PP
            const ppResult = parsePP(fullText);
            console.log(`[Worker] PP parsed: ${ppResult.chunks.length} chunks, identity: ${JSON.stringify(ppResult.identity)}`);

            // Convert date strings to Date objects if present
            let tanggalTerbit: Date | null = null;
            if (ppResult.identity.tanggalDitetapkan) {
                try {
                    const dateStr = ppResult.identity.tanggalDitetapkan;
                    const months: Record<string, number> = {
                        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
                        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
                    };
                    const match = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/);
                    if (match) {
                        const day = parseInt(match[1], 10);
                        const month = months[match[2].toLowerCase()];
                        const year = parseInt(match[3], 10);
                        if (month !== undefined) {
                            tanggalTerbit = new Date(year, month, day);
                        }
                    }
                } catch (e) {
                    console.warn(`[Worker] Failed to parse PP tanggalDitetapkan: ${e}`);
                }
            }

            // Upsert metadata with PP info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'PP',
                    nomor: ppResult.identity.nomor ?? null,
                    tahun: ppResult.identity.tahun ?? null,
                    judul: ppResult.identity.tentang ?? null,
                    tanggalTerbit,
                    statusAturan: 'berlaku',
                    documentSubtype: 'UNKNOWN',
                    confidence: extracted.confidence,
                    extractionNotes: { hasPenjelasan: ppResult.chunks.some(c => c.sourcePart === 'PENJELASAN') },
                },
                update: {
                    jenis: 'PP',
                    nomor: ppResult.identity.nomor ?? null,
                    tahun: ppResult.identity.tahun ?? null,
                    judul: ppResult.identity.tentang ?? null,
                    tanggalTerbit,
                    confidence: extracted.confidence,
                    extractionNotes: { hasPenjelasan: ppResult.chunks.some(c => c.sourcePart === 'PENJELASAN') },
                },
            });

            // Delete old chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert PP chunks
            if (ppResult.chunks.length > 0) {
                const chunkData = ppResult.chunks.map(chunk => {
                    const dbChunk = ppChunkToDbFormat(chunk);
                    return {
                        documentId,
                        anchorCitation: dbChunk.anchorCitation,
                        pasal: dbChunk.pasal,
                        ayat: dbChunk.ayat,
                        huruf: dbChunk.huruf,
                        bab: dbChunk.bab,
                        bagian: dbChunk.bagian,
                        paragraf: dbChunk.paragraf,
                        chunkType: dbChunk.chunkType as any,
                        role: dbChunk.role as any,
                        title: dbChunk.title,
                        parentChunkId: dbChunk.parentChunkId,
                        legalRefs: dbChunk.legalRefs ?? undefined,
                        orderIndex: dbChunk.orderIndex,
                        text: dbChunk.text,
                        tokenEstimate: dbChunk.tokenEstimate,
                        sourcePart: dbChunk.sourcePart,
                    };
                });
                await prisma.regulationChunk.createMany({
                    data: chunkData,
                });
                console.log(`[Worker] Inserted ${ppResult.chunks.length} PP chunks`);
            }

            // Log chunk summary
            console.log(`[Worker] PP chunk types breakdown:`);
            const typeCounts = ppResult.chunks.reduce((acc, c) => {
                const key = `${c.sourcePart}:${c.chunkType}`;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            Object.entries(typeCounts).forEach(([type, count]) => {
                console.log(`[Worker]   - ${type}: ${count}`);
            });

            // Extract tables from PP using Qwen AI
            try {
                console.log(`[Worker] Extracting tables from PP using Qwen AI...`);
                const tableResult = await extractTablesFromText(fullText, `PP ${ppResult.identity.nomor || 'Unknown'}/${ppResult.identity.tahun || 'YYYY'}`);

                if (tableResult.tables.length > 0) {
                    await prisma.documentTable.deleteMany({
                        where: { documentId },
                    });

                    await prisma.documentTable.createMany({
                        data: tableResult.tables.map((table, idx) => ({
                            documentId,
                            title: table.title,
                            pageContext: table.pageContext ?? null,
                            headers: table.headers,
                            rows: table.rows,
                            notes: table.notes ?? null,
                            orderIndex: idx,
                        })),
                    });
                    console.log(`[Worker] Inserted ${tableResult.tables.length} tables from PP`);
                } else {
                    console.log(`[Worker] No tables found in PP`);
                }
            } catch (tableError) {
                console.error(`[Worker] Table extraction failed (non-critical):`, tableError);
            }
        } else if (isPERPU) {
            // PERPU: use specialized PERPU extractor (structure identical to UU)
            console.log(`[Worker] Processing as PERPU document`);

            // Parse PERPU
            const perpuResult = parsePerpu(fullText);
            console.log(`[Worker] PERPU parsed: ${perpuResult.chunks.length} chunks, identity: ${JSON.stringify(perpuResult.identity)}`);

            // Convert date strings to Date objects if present
            let tanggalTerbit: Date | null = null;
            if (perpuResult.identity.tanggalDitetapkan) {
                try {
                    const dateStr = perpuResult.identity.tanggalDitetapkan;
                    const months: Record<string, number> = {
                        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
                        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
                    };
                    const match = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/);
                    if (match) {
                        const day = parseInt(match[1], 10);
                        const month = months[match[2].toLowerCase()];
                        const year = parseInt(match[3], 10);
                        if (month !== undefined) {
                            tanggalTerbit = new Date(year, month, day);
                        }
                    }
                } catch (e) {
                    console.warn(`[Worker] Failed to parse PERPU tanggalDitetapkan: ${e}`);
                }
            }

            // Upsert metadata with PERPU info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'PERPU' as any,
                    nomor: perpuResult.identity.nomor ?? null,
                    tahun: perpuResult.identity.tahun ?? null,
                    judul: perpuResult.identity.tentang ?? null,
                    tanggalTerbit,
                    statusAturan: 'berlaku',
                    documentSubtype: 'UNKNOWN',
                    confidence: extracted.confidence,
                    extractionNotes: {
                        hasPenjelasan: perpuResult.chunks.some(c => c.sourcePart === 'PENJELASAN'),
                        perpuStatus: perpuResult.identity.status,
                    },
                },
                update: {
                    jenis: 'PERPU' as any,
                    nomor: perpuResult.identity.nomor ?? null,
                    tahun: perpuResult.identity.tahun ?? null,
                    judul: perpuResult.identity.tentang ?? null,
                    tanggalTerbit,
                    confidence: extracted.confidence,
                    extractionNotes: {
                        hasPenjelasan: perpuResult.chunks.some(c => c.sourcePart === 'PENJELASAN'),
                        perpuStatus: perpuResult.identity.status,
                    },
                },
            });

            // Delete old chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert PERPU chunks
            if (perpuResult.chunks.length > 0) {
                const chunkData = perpuResult.chunks.map(chunk => {
                    const dbChunk = perpuChunkToDbFormat(chunk);
                    return {
                        documentId,
                        anchorCitation: dbChunk.anchorCitation,
                        pasal: dbChunk.pasal,
                        ayat: dbChunk.ayat,
                        huruf: dbChunk.huruf,
                        bab: dbChunk.bab,
                        bagian: dbChunk.bagian,
                        paragraf: dbChunk.paragraf,
                        chunkType: dbChunk.chunkType as any,
                        role: dbChunk.role as any,
                        title: dbChunk.title,
                        parentChunkId: dbChunk.parentChunkId,
                        legalRefs: dbChunk.legalRefs ?? undefined,
                        orderIndex: dbChunk.orderIndex,
                        text: dbChunk.text,
                        tokenEstimate: dbChunk.tokenEstimate,
                        sourcePart: dbChunk.sourcePart,
                    };
                });
                await prisma.regulationChunk.createMany({
                    data: chunkData,
                });
                console.log(`[Worker] Inserted ${perpuResult.chunks.length} PERPU chunks`);
            }

            // Log chunk summary
            console.log(`[Worker] PERPU chunk types breakdown:`);
            const typeCounts = perpuResult.chunks.reduce((acc, c) => {
                const key = `${c.sourcePart}:${c.chunkType}`;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            Object.entries(typeCounts).forEach(([type, count]) => {
                console.log(`[Worker]   - ${type}: ${count}`);
            });

            // Extract tables from PERPU using Qwen AI
            try {
                console.log(`[Worker] Extracting tables from PERPU using Qwen AI...`);
                const tableResult = await extractTablesFromText(fullText, `PERPU ${perpuResult.identity.nomor || 'Unknown'}/${perpuResult.identity.tahun || 'YYYY'}`);

                if (tableResult.tables.length > 0) {
                    await prisma.documentTable.deleteMany({
                        where: { documentId },
                    });

                    await prisma.documentTable.createMany({
                        data: tableResult.tables.map((table, idx) => ({
                            documentId,
                            title: table.title,
                            pageContext: table.pageContext ?? null,
                            headers: table.headers,
                            rows: table.rows,
                            notes: table.notes ?? null,
                            orderIndex: idx,
                        })),
                    });
                    console.log(`[Worker] Inserted ${tableResult.tables.length} tables from PERPU`);
                } else {
                    console.log(`[Worker] No tables found in PERPU`);
                }
            } catch (tableError) {
                console.error(`[Worker] Table extraction failed (non-critical):`, tableError);
            }
        } else if (isUU) {
            // UU: use specialized UU extractor (same structure as PERPU)
            console.log(`[Worker] Processing as UU document`);

            // Parse UU
            const uuResult = parseUu(fullText);
            console.log(`[Worker] UU parsed: ${uuResult.chunks.length} chunks, identity: ${JSON.stringify(uuResult.identity)}`);

            // Convert date strings to Date objects if present
            let tanggalTerbit: Date | null = null;
            if (uuResult.identity.tanggalDitetapkan) {
                try {
                    const dateStr = uuResult.identity.tanggalDitetapkan;
                    const months: Record<string, number> = {
                        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
                        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
                    };
                    const match = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/);
                    if (match) {
                        const day = parseInt(match[1], 10);
                        const month = months[match[2].toLowerCase()];
                        const year = parseInt(match[3], 10);
                        if (month !== undefined) {
                            tanggalTerbit = new Date(year, month, day);
                        }
                    }
                } catch (e) {
                    console.warn(`[Worker] Failed to parse UU tanggalDitetapkan: ${e}`);
                }
            }

            // Upsert metadata with UU info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'UU',
                    nomor: uuResult.identity.nomor ?? null,
                    tahun: uuResult.identity.tahun ?? null,
                    judul: uuResult.identity.tentang ?? null,
                    tanggalTerbit,
                    statusAturan: 'berlaku',
                    documentSubtype: 'UNKNOWN',
                    confidence: extracted.confidence,
                    extractionNotes: {
                        hasPenjelasan: uuResult.chunks.some(c => c.sourcePart === 'PENJELASAN'),
                    },
                },
                update: {
                    jenis: 'UU',
                    nomor: uuResult.identity.nomor ?? null,
                    tahun: uuResult.identity.tahun ?? null,
                    judul: uuResult.identity.tentang ?? null,
                    tanggalTerbit,
                    confidence: extracted.confidence,
                    extractionNotes: {
                        hasPenjelasan: uuResult.chunks.some(c => c.sourcePart === 'PENJELASAN'),
                    },
                },
            });

            // Delete old chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert UU chunks
            if (uuResult.chunks.length > 0) {
                const chunkData = uuResult.chunks.map(chunk => {
                    const dbChunk = uuChunkToDbFormat(chunk, documentId);
                    return {
                        documentId,
                        anchorCitation: dbChunk.anchorCitation,
                        pasal: dbChunk.pasal,
                        ayat: dbChunk.ayat,
                        huruf: dbChunk.huruf,
                        chunkType: dbChunk.chunkType as any,
                        role: 'UNKNOWN' as const,
                        title: dbChunk.title,
                        orderIndex: dbChunk.orderIndex,
                        text: dbChunk.text,
                        tokenEstimate: dbChunk.tokenEstimate,
                    };
                });

                await prisma.regulationChunk.createMany({
                    data: chunkData as any,
                });
                console.log(`[Worker] Inserted ${uuResult.chunks.length} UU chunks`);

                // Log chunk types breakdown
                console.log(`[Worker] UU chunk types breakdown:`);
                const typeCounts = uuResult.chunks.reduce((acc, c) => {
                    const key = `${c.sourcePart}:${c.chunkType}`;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);
                Object.entries(typeCounts).forEach(([type, count]) => {
                    console.log(`[Worker]   - ${type}: ${count}`);
                });
            }

            // Extract tables using Qwen AI
            try {
                console.log(`[Worker] Extracting tables from UU using Qwen AI...`);
                const tableResult = await extractTablesFromText(fullText, `UU ${uuResult.identity.nomor || 'Unknown'}/${uuResult.identity.tahun || 'YYYY'}`);

                if (tableResult.tables.length > 0) {
                    await prisma.documentTable.deleteMany({
                        where: { documentId },
                    });

                    await prisma.documentTable.createMany({
                        data: tableResult.tables.map((table, idx) => ({
                            documentId,
                            title: table.title,
                            pageContext: table.pageContext ?? null,
                            headers: table.headers,
                            rows: table.rows,
                            notes: table.notes ?? null,
                            orderIndex: idx,
                        })),
                    });
                    console.log(`[Worker] Inserted ${tableResult.tables.length} tables from UU`);
                } else {
                    console.log(`[Worker] No tables found in UU`);
                }
            } catch (tableError) {
                console.error(`[Worker] Table extraction failed (non-critical):`, tableError);
            }
        } else if (isSE) {
            // SE: use specialized SE extractor
            console.log(`[Worker] Processing as SE document`);

            // Parse SE
            const seResult = parseSE(fullText);
            console.log(`[Worker] SE parsed: ${seResult.chunks.length} chunks, identity: ${JSON.stringify(seResult.identity)}`);

            // Upsert metadata with SE info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'SE',
                    nomor: seResult.identity.nomor ?? null,
                    tahun: seResult.identity.tahun ?? null,
                    judul: seResult.identity.tentang ?? null,
                    statusAturan: 'berlaku',
                    documentSubtype: 'UNKNOWN',
                    confidence: extracted.confidence,
                    extractionNotes: { sections: seResult.sections.length },
                },
                update: {
                    jenis: 'SE',
                    nomor: seResult.identity.nomor ?? null,
                    tahun: seResult.identity.tahun ?? null,
                    judul: seResult.identity.tentang ?? null,
                    confidence: extracted.confidence,
                    extractionNotes: { sections: seResult.sections.length },
                },
            });

            // Delete old chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert SE chunks
            if (seResult.chunks.length > 0) {
                const chunkData = seResult.chunks.map(chunk => {
                    const dbChunk = seChunkToDbFormat(chunk);
                    return {
                        documentId,
                        anchorCitation: dbChunk.anchorCitation,
                        pasal: dbChunk.pasal,
                        ayat: dbChunk.ayat,
                        huruf: dbChunk.huruf,
                        bab: dbChunk.bab,
                        bagian: dbChunk.bagian,
                        paragraf: dbChunk.paragraf,
                        chunkType: dbChunk.chunkType as any,
                        role: dbChunk.role as any,
                        title: dbChunk.title,
                        parentChunkId: dbChunk.parentChunkId,
                        legalRefs: dbChunk.legalRefs ?? undefined,
                        orderIndex: dbChunk.orderIndex,
                        text: dbChunk.text,
                        tokenEstimate: dbChunk.tokenEstimate,
                        sourcePart: dbChunk.sourcePart,
                    };
                });
                await prisma.regulationChunk.createMany({
                    data: chunkData,
                });
                console.log(`[Worker] Inserted ${seResult.chunks.length} SE chunks`);
            }

            // Log chunk summary
            console.log(`[Worker] SE chunk types breakdown:`);
            const typeCounts = seResult.chunks.reduce((acc, c) => {
                acc[c.chunkType] = (acc[c.chunkType] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            Object.entries(typeCounts).forEach(([type, count]) => {
                console.log(`[Worker]   - ${type}: ${count}`);
            });
        } else if (isNotaDinas) {
            // NOTA_DINAS: use specialized Nota Dinas extractor
            console.log(`[Worker] Processing as NOTA_DINAS document`);

            // Parse Nota Dinas
            const ndResult = parseNotaDinas(fullText);
            console.log(`[Worker] Nota Dinas parsed: ${ndResult.chunks.length} chunks, identity: ${JSON.stringify(ndResult.identity)}`);

            // Upsert metadata with Nota Dinas info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'NOTA_DINAS',
                    nomor: ndResult.identity.nomor ?? null,
                    tahun: ndResult.identity.nomor ? parseInt(ndResult.identity.nomor.match(/\/(\d{4})$/)?.[1] || '0', 10) || null : null,
                    judul: ndResult.identity.hal ?? null,
                    statusAturan: 'berlaku',
                    documentSubtype: 'UNKNOWN',
                    confidence: extracted.confidence,
                    extractionNotes: {
                        sections: ndResult.sections.length,
                        dari: ndResult.identity.dari,
                        kepada: ndResult.identity.kepada,
                        sifat: ndResult.identity.sifat,
                        tanggal: ndResult.identity.tanggal,
                    },
                },
                update: {
                    jenis: 'NOTA_DINAS',
                    nomor: ndResult.identity.nomor ?? null,
                    tahun: ndResult.identity.nomor ? parseInt(ndResult.identity.nomor.match(/\/(\d{4})$/)?.[1] || '0', 10) || null : null,
                    judul: ndResult.identity.hal ?? null,
                    confidence: extracted.confidence,
                    extractionNotes: {
                        sections: ndResult.sections.length,
                        dari: ndResult.identity.dari,
                        kepada: ndResult.identity.kepada,
                        sifat: ndResult.identity.sifat,
                        tanggal: ndResult.identity.tanggal,
                    },
                },
            });

            // Delete old chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert Nota Dinas chunks
            if (ndResult.chunks.length > 0) {
                const chunkData = ndResult.chunks.map(chunk => {
                    const dbChunk = notaDinasChunkToDbFormat(chunk);
                    return {
                        documentId,
                        anchorCitation: dbChunk.anchorCitation,
                        pasal: dbChunk.pasal,
                        ayat: dbChunk.ayat,
                        huruf: dbChunk.huruf,
                        bab: dbChunk.bab,
                        bagian: dbChunk.bagian,
                        paragraf: dbChunk.paragraf,
                        chunkType: dbChunk.chunkType as any,
                        role: dbChunk.role as any,
                        title: dbChunk.title,
                        parentChunkId: dbChunk.parentChunkId,
                        legalRefs: dbChunk.legalRefs ?? undefined,
                        orderIndex: dbChunk.orderIndex,
                        text: dbChunk.text,
                        tokenEstimate: dbChunk.tokenEstimate,
                        sourcePart: dbChunk.sourcePart,
                    };
                });
                await prisma.regulationChunk.createMany({
                    data: chunkData,
                });
                console.log(`[Worker] Inserted ${ndResult.chunks.length} Nota Dinas chunks`);
            }

            // Log chunk summary
            console.log(`[Worker] Nota Dinas chunk types breakdown:`);
            const ndTypeCounts = ndResult.chunks.reduce((acc, c) => {
                acc[c.chunkType] = (acc[c.chunkType] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            Object.entries(ndTypeCounts).forEach(([type, count]) => {
                console.log(`[Worker]   - ${type}: ${count}`);
            });

            // Extract tables using Qwen AI
            try {
                console.log(`[Worker] Extracting tables from Nota Dinas using Qwen...`);
                const tableResult = await extractTablesFromText(fullText, 'Nota Dinas');

                if (tableResult.tables.length > 0) {
                    // Delete old tables
                    await prisma.documentTable.deleteMany({
                        where: { documentId },
                    });

                    // Insert new tables
                    for (let i = 0; i < tableResult.tables.length; i++) {
                        const table = tableResult.tables[i];
                        await prisma.documentTable.create({
                            data: {
                                documentId,
                                title: table.title,
                                pageContext: table.pageContext,
                                headers: table.headers,
                                rows: table.rows,
                                notes: table.notes || null,
                                orderIndex: i,
                            },
                        });
                    }
                    console.log(`[Worker] Extracted and saved ${tableResult.tables.length} tables from Nota Dinas`);
                } else {
                    console.log(`[Worker] No tables found in Nota Dinas`);
                }
            } catch (tableError) {
                console.error(`[Worker] Table extraction failed for Nota Dinas:`, tableError);
                // Continue processing, table extraction is optional
            }
        } else if (isBuku) {
            // BUKU: use AI-based chunking with fallback to regex
            console.log(`[Worker] Processing as BUKU document`);

            // First extract identity with regex (fast)
            const identity = extractBukuIdentity(fullText);

            let chunks: BookChunk[] = [];
            let extractionMethod = 'regex';

            // Try AI chunking if available
            if (isAIChunkingAvailable()) {
                try {
                    console.log(`[Worker] Using AI-based book chunking (DeepSeek)`);
                    chunks = await parseBookWithAI(fullText, {
                        jenis: 'BUKU',
                        nomor: null,
                        tahun: identity.tahun,
                        judul: identity.judul,
                    });
                    extractionMethod = 'ai';
                    console.log(`[Worker] AI chunking produced ${chunks.length} chunks`);
                } catch (aiError) {
                    console.error(`[Worker] AI chunking failed, falling back to regex:`, aiError);
                    // Fallback to regex
                    const bukuResult = parseBuku(fullText);
                    chunks = bukuResult.chunks.map((c, idx) => ({
                        title: c.title,
                        chunkType: c.chunkType as 'BAB' | 'SUBBAB' | 'SECTION' | 'PREAMBLE',
                        text: c.text,
                        orderIndex: idx,
                        tokenEstimate: c.tokenEstimate,
                        anchorCitation: c.anchorCitation,
                    }));
                }
            } else {
                console.log(`[Worker] AI not available, using regex-based chunking`);
                const bukuResult = parseBuku(fullText);
                chunks = bukuResult.chunks.map((c, idx) => ({
                    title: c.title,
                    chunkType: c.chunkType as 'BAB' | 'SUBBAB' | 'SECTION' | 'PREAMBLE',
                    text: c.text,
                    orderIndex: idx,
                    tokenEstimate: c.tokenEstimate,
                    anchorCitation: c.anchorCitation,
                }));
            }

            console.log(`[Worker] Final: ${chunks.length} chunks using ${extractionMethod}`);

            // Upsert metadata with buku info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'BUKU',
                    nomor: null,
                    tahun: identity.tahun,
                    judul: identity.judul || 'Buku Tidak Diketahui',
                    confidence: identity.judul ? 0.8 : 0.5,
                    extractionNotes: {
                        docType: 'BUKU',
                        extractionMethod,
                        penulis: identity.penulis,
                        penerbit: identity.penerbit,
                        chunkCount: chunks.length,
                    },
                    updatedByUser: false,
                },
                update: {
                    jenis: 'BUKU',
                    tahun: identity.tahun,
                    judul: identity.judul || 'Buku Tidak Diketahui',
                    confidence: identity.judul ? 0.8 : 0.5,
                    extractionNotes: {
                        docType: 'BUKU',
                        extractionMethod,
                        penulis: identity.penulis,
                        penerbit: identity.penerbit,
                        chunkCount: chunks.length,
                    },
                },
            });

            // Delete existing chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert buku chunks
            if (chunks.length > 0) {
                await prisma.regulationChunk.createMany({
                    data: chunks.map(chunk => ({
                        documentId,
                        anchorCitation: chunk.anchorCitation,
                        pasal: null,
                        ayat: null,
                        huruf: null,
                        chunkType: chunk.chunkType,
                        role: 'UNKNOWN' as const,
                        title: chunk.title,
                        orderIndex: chunk.orderIndex,
                        text: chunk.text,
                        tokenEstimate: chunk.tokenEstimate,
                    })),
                });
                console.log(`[Worker] Inserted ${chunks.length} buku chunks`);
            }

            // Log chunk summary
            console.log(`[Worker] Chunk types breakdown:`);
            const typeCounts = chunks.reduce((acc, c) => {
                acc[c.chunkType] = (acc[c.chunkType] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            Object.entries(typeCounts).forEach(([type, count]) => {
                console.log(`[Worker]   - ${type}: ${count}`);
            });
        } else if (!isPutusan) {
            // PERATURAN: existing extraction logic

            // 5. Upsert metadata
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: effectiveJenis as any,
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
                    jenis: effectiveJenis as any,
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
                jenis: effectiveJenis,
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
                        chunkType: chunk.pasal ? 'PASAL' : 'PREAMBLE',
                        role: 'UNKNOWN',
                        orderIndex: chunk.orderIndex,
                        text: chunk.text,
                        tokenEstimate: chunk.tokenEstimate,
                    })),
                });
                console.log(`[Worker] Inserted ${chunks.length} chunks`);
            }
        } else {
            // PUTUSAN: use putusan extractor
            console.log(`[Worker] Processing as PUTUSAN document`);

            const putusanResult = parsePutusan(fullText);
            console.log(`[Worker] Parsed putusan: ${putusanResult.sections.length} sections, ${putusanResult.chunks.length} chunks`);

            // Extract identity for metadata
            const identity = putusanResult.identity;

            // Upsert metadata with putusan info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'PUTUSAN', // Use PUTUSAN as jenis
                    nomor: identity.nomor,
                    tahun: identity.tahun,
                    judul: `Putusan Pengadilan Pajak ${identity.nomor || ''}`.trim(),
                    confidence: identity.nomor ? 0.8 : 0.5,
                    extractionNotes: {
                        docType: 'PUTUSAN',
                        sections: putusanResult.sections.map(s => s.type),
                        evidenceCount: putusanResult.evidenceItems.length,
                    },
                    updatedByUser: false,
                },
                update: {
                    jenis: 'PUTUSAN',
                    nomor: identity.nomor,
                    tahun: identity.tahun,
                    judul: `Putusan Pengadilan Pajak ${identity.nomor || ''}`.trim(),
                    confidence: identity.nomor ? 0.8 : 0.5,
                    extractionNotes: {
                        docType: 'PUTUSAN',
                        sections: putusanResult.sections.map(s => s.type),
                        evidenceCount: putusanResult.evidenceItems.length,
                    },
                },
            });

            // Delete existing chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(`[Worker] Deleted old chunks`);

            // Insert putusan chunks
            if (putusanResult.chunks.length > 0) {
                const chunkData = putusanResult.chunks.map(chunk => {
                    const dbFormat = putusanChunkToDbFormat(chunk);
                    return {
                        documentId,
                        ...dbFormat,
                        // Prisma requires undefined instead of null for optional JSON
                        legalRefs: dbFormat.legalRefs ?? undefined,
                    };
                });

                await prisma.regulationChunk.createMany({
                    data: chunkData,
                });
                console.log(`[Worker] Inserted ${putusanResult.chunks.length} putusan chunks`);
            }

            // Log evidence items found
            if (putusanResult.evidenceItems.length > 0) {
                console.log(`[Worker] Found ${putusanResult.evidenceItems.length} evidence items:`);
                putusanResult.evidenceItems.forEach(e => {
                    console.log(`[Worker]   - ${e.code}: ${e.description.substring(0, 50)}...`);
                });
            }

            // Extract tables using DeepSeek AI
            console.log(`[Worker] Extracting tables using DeepSeek AI...`);
            try {
                // Delete existing tables for this document
                await prisma.documentTable.deleteMany({
                    where: { documentId },
                });

                const tableResult = await extractTablesFromText(fullText, 'Putusan Pengadilan Pajak');
                console.log(`[Worker] DeepSeek extracted ${tableResult.tables.length} tables`);

                if (tableResult.tables.length > 0) {
                    const tableData = tableResult.tables.map((table, idx) => ({
                        documentId,
                        title: table.title,
                        pageContext: table.pageContext,
                        headers: table.headers,
                        rows: table.rows,
                        notes: table.notes || null,
                        orderIndex: idx,
                    }));

                    await prisma.documentTable.createMany({
                        data: tableData,
                    });
                    console.log(`[Worker] Saved ${tableResult.tables.length} tables to database`);
                }

                if (tableResult.processingNotes) {
                    console.log(`[Worker] Table extraction notes: ${tableResult.processingNotes}`);
                }
            } catch (tableError) {
                console.error(`[Worker] Table extraction failed:`, tableError);
                // Don't fail the whole job, just log the error
            }
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
    // Increase lock duration to 10 minutes for OCR processing
    lockDuration: 600000, // 10 minutes in milliseconds
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
