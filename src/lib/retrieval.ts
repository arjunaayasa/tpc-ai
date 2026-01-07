/**
 * Retrieval module for RAG - pgvector similarity search
 */

import { PrismaClient, RegulationType, RegulationStatus } from '@prisma/client';
import { embedQuery } from './embeddings';

const prisma = new PrismaClient();

export interface RetrievalFilters {
    jenis?: RegulationType;
    nomor?: string;
    tahun?: number;
    pasal?: string;
    statusAturan?: RegulationStatus;
    documentId?: string;
}

export interface ChunkResult {
    chunkId: string;
    documentId: string;
    anchorCitation: string;
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    text: string;
    tokenEstimate: number | null;
    similarity: number;
    metadata: {
        jenis: string;
        nomor: string | null;
        tahun: number | null;
        judul: string | null;
        statusAturan: string;
    };
}

/**
 * Retrieve relevant chunks using pgvector similarity search
 */
export async function retrieve(
    question: string,
    topK: number = 12,
    filters?: RetrievalFilters
): Promise<ChunkResult[]> {
    // 1. Embed the query
    console.log(`[Retrieval] Embedding query: "${question.substring(0, 50)}..."`);
    const queryVector = await embedQuery(question);
    const vectorString = `[${queryVector.join(',')}]`;

    // 2. Build dynamic filter conditions
    const conditions: string[] = ['ce.embedding IS NOT NULL'];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (filters?.jenis) {
        conditions.push(`dm.jenis = $${paramIndex}::text::"RegulationType"`);
        params.push(filters.jenis);
        paramIndex++;
    }

    if (filters?.nomor) {
        conditions.push(`dm.nomor ILIKE $${paramIndex}`);
        params.push(`%${filters.nomor}%`);
        paramIndex++;
    }

    if (filters?.tahun) {
        conditions.push(`dm.tahun = $${paramIndex}`);
        params.push(filters.tahun);
        paramIndex++;
    }

    if (filters?.pasal) {
        conditions.push(`rc.pasal = $${paramIndex}`);
        params.push(filters.pasal);
        paramIndex++;
    }

    if (filters?.statusAturan) {
        conditions.push(`dm."statusAturan" = $${paramIndex}::text::"RegulationStatus"`);
        params.push(filters.statusAturan);
        paramIndex++;
    }

    if (filters?.documentId) {
        conditions.push(`rc."documentId" = $${paramIndex}`);
        params.push(filters.documentId);
        paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 3. Execute similarity search with raw SQL
    // Using cosine distance: 1 - (a <=> b) gives similarity score
    const query = `
        SELECT 
            rc.id as "chunkId",
            rc."documentId",
            rc."anchorCitation",
            rc.pasal,
            rc.ayat,
            rc.huruf,
            rc.text,
            rc."tokenEstimate",
            1 - (ce.embedding <=> $${paramIndex}::vector) as similarity,
            dm.jenis,
            dm.nomor,
            dm.tahun,
            dm.judul,
            dm."statusAturan"
        FROM "ChunkEmbedding" ce
        JOIN "RegulationChunk" rc ON rc.id = ce."chunkId"
        LEFT JOIN "DocumentMetadata" dm ON dm."documentId" = rc."documentId"
        ${whereClause}
        ORDER BY ce.embedding <=> $${paramIndex}::vector
        LIMIT $${paramIndex + 1}
    `;

    params.push(vectorString as unknown as number); // vector string
    params.push(topK);

    console.log(`[Retrieval] Executing similarity search with topK=${topK}`);

    type RawResult = {
        chunkId: string;
        documentId: string;
        anchorCitation: string;
        pasal: string | null;
        ayat: string | null;
        huruf: string | null;
        text: string;
        tokenEstimate: number | null;
        similarity: number;
        jenis: string;
        nomor: string | null;
        tahun: number | null;
        judul: string | null;
        statusAturan: string;
    };

    const results = await prisma.$queryRawUnsafe<RawResult[]>(query, ...params);

    console.log(`[Retrieval] Found ${results.length} relevant chunks`);

    // 4. Transform results
    return results.map((row) => ({
        chunkId: row.chunkId,
        documentId: row.documentId,
        anchorCitation: row.anchorCitation,
        pasal: row.pasal,
        ayat: row.ayat,
        huruf: row.huruf,
        text: row.text,
        tokenEstimate: row.tokenEstimate,
        similarity: parseFloat(String(row.similarity)),
        metadata: {
            jenis: row.jenis || 'UNKNOWN',
            nomor: row.nomor,
            tahun: row.tahun,
            judul: row.judul,
            statusAturan: row.statusAturan || 'unknown',
        },
    }));
}

/**
 * Get chunk by ID with metadata
 */
export async function getChunkById(chunkId: string): Promise<ChunkResult | null> {
    const chunk = await prisma.regulationChunk.findUnique({
        where: { id: chunkId },
        include: {
            document: {
                include: {
                    metadata: true,
                },
            },
        },
    });

    if (!chunk) return null;

    return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        anchorCitation: chunk.anchorCitation,
        pasal: chunk.pasal,
        ayat: chunk.ayat,
        huruf: chunk.huruf,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
        similarity: 1.0,
        metadata: {
            jenis: chunk.document.metadata?.jenis || 'UNKNOWN',
            nomor: chunk.document.metadata?.nomor || null,
            tahun: chunk.document.metadata?.tahun || null,
            judul: chunk.document.metadata?.judul || null,
            statusAturan: chunk.document.metadata?.statusAturan || 'unknown',
        },
    };
}
