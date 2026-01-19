/**
 * Hybrid Retriever - Vector + Keyword search with score fusion
 * Implements diversity constraints and doc-type boosting
 */

import { PrismaClient } from '@prisma/client';
import { embedQuery } from '../embeddings';
import {
    RetrievalPlan,
    ChunkCandidate,
    DocumentType,
} from './types';

const prisma = new PrismaClient();

// ============== SCORE WEIGHTS ==============

const VECTOR_WEIGHT = 0.65;
const KEYWORD_WEIGHT = 0.35;

// Doc type boost factors
const DOC_TYPE_BOOST: Record<DocumentType, number> = {
    UU: 1.15,
    PP: 1.10,
    PMK: 1.12,
    PER: 1.08,
    SE: 1.05,
    NOTA_DINAS: 1.03,
    KEP: 1.00,
    PERPU: 1.08,
    PUTUSAN: 1.00,
    BUKU: 0.95,
    UNKNOWN: 0.90,
};

// Chunk type relevance boost
const CHUNK_TYPE_BOOST: Record<string, number> = {
    PASAL: 1.10,
    AYAT: 1.05,
    HURUF: 1.00,
    PENJELASAN_PASAL: 1.02,
    PENJELASAN_AYAT: 1.00,
    TABLE: 1.05,
    AMAR: 1.08,
    PREAMBLE: 0.95,
};

// ============== MAIN FUNCTION ==============

/**
 * Perform hybrid retrieval combining vector and keyword search
 */
export async function hybridRetrieve(
    plan: RetrievalPlan,
    question: string
): Promise<ChunkCandidate[]> {
    console.log(`[Retriever] Starting hybrid retrieval`);
    console.log(`[Retriever] Vector topK: ${plan.retrieval_config.vector_top_k_candidate}`);
    console.log(`[Retriever] Keyword topK: ${plan.retrieval_config.keyword_top_k_candidate}`);

    // 1. Get vector search results
    const vectorResults = await vectorSearch(
        question,
        plan.query_variants,
        plan.retrieval_config.vector_top_k_candidate,
        plan.entities.doc_refs,
        plan.doc_type_guards
    );
    console.log(`[Retriever] Vector search returned ${vectorResults.length} results`);

    // 2. Get keyword search results
    const keywordResults = await keywordSearch(
        plan.query_variants,
        plan.retrieval_config.keyword_top_k_candidate,
        plan.entities,
        plan.doc_type_guards
    );
    console.log(`[Retriever] Keyword search returned ${keywordResults.length} results`);

    // 3. Merge and deduplicate
    const merged = mergeResults(vectorResults, keywordResults);
    console.log(`[Retriever] Merged: ${merged.length} unique chunks`);

    // 4. Calculate final scores with boosts
    const scored = applyBoosts(merged, plan.doc_type_priority);

    // 5. Apply diversity constraints
    const diverse = applyDiversityConstraints(
        scored,
        plan.retrieval_config.max_chunks_per_document,
        plan.retrieval_config.min_distinct_documents
    );
    console.log(`[Retriever] After diversity: ${diverse.length} chunks`);

    // 6. Sort by final score and limit
    const sorted = diverse
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, plan.retrieval_config.vector_top_k_candidate);

    return sorted;
}

// ============== VECTOR SEARCH ==============

async function vectorSearch(
    question: string,
    queryVariants: string[],
    topK: number,
    docRefs: RetrievalPlan['entities']['doc_refs'],
    docTypeGuards: DocumentType[]
): Promise<ChunkCandidate[]> {
    // Embed all query variants and average
    const queries = [question, ...queryVariants.slice(0, 3)];
    const embeddings = await Promise.all(queries.map(q => embedQuery(q)));

    // Average the embeddings for better coverage
    const avgEmbedding = averageEmbeddings(embeddings);
    const vectorString = `[${avgEmbedding.join(',')}]`;

    // Build filter conditions
    const conditions: string[] = ['ce.embedding IS NOT NULL'];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Apply doc type guards (whitelist)
    if (docTypeGuards.length > 0) {
        conditions.push(`dm.jenis IN (${docTypeGuards.map((_, i) => `$${paramIndex + i}::text::"RegulationType"`).join(', ')})`);
        params.push(...docTypeGuards);
        paramIndex += docTypeGuards.length;
    }

    // Apply doc refs filter if specific documents mentioned
    if (docRefs.length > 0) {
        const refConditions: string[] = [];
        for (const ref of docRefs) {
            const subConditions: string[] = [];
            subConditions.push(`dm.jenis = $${paramIndex}::text::"RegulationType"`);
            params.push(ref.type);
            paramIndex++;

            if (ref.number) {
                subConditions.push(`dm.nomor ILIKE $${paramIndex}`);
                params.push(`%${ref.number}%`);
                paramIndex++;
            }
            if (ref.year) {
                subConditions.push(`dm.tahun = $${paramIndex}`);
                params.push(ref.year);
                paramIndex++;
            }
            refConditions.push(`(${subConditions.join(' AND ')})`);
        }
        // Use OR for multiple doc refs (find any of them)
        if (refConditions.length > 0) {
            conditions.push(`(${refConditions.join(' OR ')})`);
        }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
        SELECT 
            rc.id as "chunkId",
            rc."documentId",
            rc."anchorCitation",
            rc."chunkType",
            rc.pasal,
            rc.ayat,
            rc.huruf,
            rc.text,
            rc."tokenEstimate",
            1 - (ce.embedding <=> $${paramIndex}::vector) as similarity,
            dm.jenis as "docType",
            dm.nomor as "docNumber",
            dm.tahun as "docYear",
            dm.judul as "docTitle",
            dm."statusAturan"
        FROM "ChunkEmbedding" ce
        JOIN "RegulationChunk" rc ON rc.id = ce."chunkId"
        JOIN "Document" d ON d.id = rc."documentId"
        LEFT JOIN "DocumentMetadata" dm ON dm."documentId" = rc."documentId"
        WHERE d."isActiveForRAG" = true
        ${conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''}
        ORDER BY ce.embedding <=> $${paramIndex}::vector
        LIMIT $${paramIndex + 1}
    `;

    params.push(vectorString as unknown as number);
    params.push(topK);

    type RawResult = {
        chunkId: string;
        documentId: string;
        anchorCitation: string;
        chunkType: string;
        pasal: string | null;
        ayat: string | null;
        huruf: string | null;
        text: string;
        tokenEstimate: number | null;
        similarity: number;
        docType: string;
        docNumber: string | null;
        docYear: number | null;
        docTitle: string | null;
        statusAturan: string;
    };

    const results = await prisma.$queryRawUnsafe<RawResult[]>(query, ...params);

    return results.map(row => ({
        chunkId: row.chunkId,
        documentId: row.documentId,
        anchorCitation: row.anchorCitation,
        chunkType: row.chunkType || 'UNKNOWN',
        pasal: row.pasal,
        ayat: row.ayat,
        huruf: row.huruf,
        text: row.text,
        tokenEstimate: row.tokenEstimate,
        vectorScore: parseFloat(String(row.similarity)),
        keywordScore: 0,
        finalScore: 0,
        docType: (row.docType || 'UNKNOWN') as DocumentType,
        docNumber: row.docNumber,
        docYear: row.docYear,
        docTitle: row.docTitle,
        statusAturan: row.statusAturan || 'unknown',
    }));
}

// ============== KEYWORD SEARCH ==============

async function keywordSearch(
    queryVariants: string[],
    topK: number,
    entities: RetrievalPlan['entities'],
    docTypeGuards: DocumentType[]
): Promise<ChunkCandidate[]> {
    // Build search terms from query variants and entities
    const searchTerms = buildSearchTerms(queryVariants, entities);

    if (searchTerms.length === 0) {
        return [];
    }

    // Use PostgreSQL full-text search with safer term formatting
    // Filter out problematic terms and format properly
    const safeTerms = searchTerms
        .map(term => term.replace(/[^\w\s]/g, '').trim().toLowerCase())
        .filter(t => t.length > 3 && /^[a-z]+$/i.test(t)); // Only alphabetic terms

    if (safeTerms.length === 0) {
        console.log('[Retriever] No valid terms for keyword search');
        return [];
    }

    // Build tsquery with & (AND) for better precision
    const tsQuery = safeTerms.slice(0, 5).join(' & ');
    console.log(`[Retriever] Keyword query: "${tsQuery}"`);

    const conditions: string[] = [];
    const params: (string | number)[] = [tsQuery];
    let paramIndex = 2;

    // Apply doc type guards
    if (docTypeGuards.length > 0) {
        conditions.push(`dm.jenis IN (${docTypeGuards.map((_, i) => `$${paramIndex + i}::text::"RegulationType"`).join(', ')})`);
        params.push(...docTypeGuards);
        paramIndex += docTypeGuards.length;
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // Use 'simple' config which is always available
    const query = `
        SELECT 
            rc.id as "chunkId",
            rc."documentId",
            rc."anchorCitation",
            rc."chunkType",
            rc.pasal,
            rc.ayat,
            rc.huruf,
            rc.text,
            rc."tokenEstimate",
            ts_rank_cd(to_tsvector('simple', rc.text), plainto_tsquery('simple', $1)) as keyword_score,
            dm.jenis as "docType",
            dm.nomor as "docNumber",
            dm.tahun as "docYear",
            dm.judul as "docTitle",
            dm."statusAturan"
        FROM "RegulationChunk" rc
        JOIN "Document" d ON d.id = rc."documentId"
        LEFT JOIN "DocumentMetadata" dm ON dm."documentId" = rc."documentId"
        WHERE d."isActiveForRAG" = true
          AND to_tsvector('simple', rc.text) @@ plainto_tsquery('simple', $1)
        ${whereClause}
        ORDER BY keyword_score DESC
        LIMIT $${paramIndex}
    `;

    params.push(topK);

    type RawResult = {
        chunkId: string;
        documentId: string;
        anchorCitation: string;
        chunkType: string;
        pasal: string | null;
        ayat: string | null;
        huruf: string | null;
        text: string;
        tokenEstimate: number | null;
        keyword_score: number;
        docType: string;
        docNumber: string | null;
        docYear: number | null;
        docTitle: string | null;
        statusAturan: string;
    };

    try {
        const results = await prisma.$queryRawUnsafe<RawResult[]>(query, ...params);

        return results.map(row => ({
            chunkId: row.chunkId,
            documentId: row.documentId,
            anchorCitation: row.anchorCitation,
            chunkType: row.chunkType || 'UNKNOWN',
            pasal: row.pasal,
            ayat: row.ayat,
            huruf: row.huruf,
            text: row.text,
            tokenEstimate: row.tokenEstimate,
            vectorScore: 0,
            keywordScore: parseFloat(String(row.keyword_score)),
            finalScore: 0,
            docType: (row.docType || 'UNKNOWN') as DocumentType,
            docNumber: row.docNumber,
            docYear: row.docYear,
            docTitle: row.docTitle,
            statusAturan: row.statusAturan || 'unknown',
        }));
    } catch (error) {
        // FTS might fail with certain query formats, fallback to empty
        console.warn('[Retriever] Keyword search failed:', error);
        return [];
    }
}

// ============== HELPERS ==============

function averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    if (embeddings.length === 1) return embeddings[0];

    const dim = embeddings[0].length;
    const result = new Array(dim).fill(0);

    for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) {
            result[i] += emb[i];
        }
    }

    for (let i = 0; i < dim; i++) {
        result[i] /= embeddings.length;
    }

    return result;
}

function buildSearchTerms(
    queryVariants: string[],
    entities: RetrievalPlan['entities']
): string[] {
    const terms: string[] = [];

    // Extract keywords from query variants
    for (const variant of queryVariants.slice(0, 3)) {
        const words = variant
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3);
        terms.push(...words);
    }

    // Add topics
    terms.push(...entities.topics);

    // Add pasal reference
    if (entities.pasal.number) {
        terms.push(`pasal ${entities.pasal.number}`);
    }

    // Dedupe
    return [...new Set(terms)];
}

function mergeResults(
    vectorResults: ChunkCandidate[],
    keywordResults: ChunkCandidate[]
): ChunkCandidate[] {
    const merged = new Map<string, ChunkCandidate>();

    // Add vector results
    for (const chunk of vectorResults) {
        merged.set(chunk.chunkId, chunk);
    }

    // Merge keyword results
    for (const chunk of keywordResults) {
        const existing = merged.get(chunk.chunkId);
        if (existing) {
            existing.keywordScore = chunk.keywordScore;
        } else {
            merged.set(chunk.chunkId, chunk);
        }
    }

    return Array.from(merged.values());
}

function applyBoosts(
    chunks: ChunkCandidate[],
    docTypePriority: DocumentType[]
): ChunkCandidate[] {
    // Build priority boost map (higher priority = higher boost)
    const priorityBoost = new Map<DocumentType, number>();
    for (let i = 0; i < docTypePriority.length; i++) {
        // First priority gets +0.1, decreasing
        priorityBoost.set(docTypePriority[i], 1 + (0.1 * (docTypePriority.length - i) / docTypePriority.length));
    }

    return chunks.map(chunk => {
        // Base fusion score
        let finalScore =
            VECTOR_WEIGHT * chunk.vectorScore +
            KEYWORD_WEIGHT * chunk.keywordScore;

        // Doc type boost
        const docBoost = DOC_TYPE_BOOST[chunk.docType] || 1.0;
        finalScore *= docBoost;

        // Priority boost
        const prioBoost = priorityBoost.get(chunk.docType) || 1.0;
        finalScore *= prioBoost;

        // Chunk type boost
        const chunkBoost = CHUNK_TYPE_BOOST[chunk.chunkType] || 1.0;
        finalScore *= chunkBoost;

        return { ...chunk, finalScore };
    });
}

function applyDiversityConstraints(
    chunks: ChunkCandidate[],
    maxPerDocument: number,
    minDistinctDocs: number
): ChunkCandidate[] {
    // Sort by score first
    const sorted = [...chunks].sort((a, b) => b.finalScore - a.finalScore);

    const result: ChunkCandidate[] = [];
    const docCounts = new Map<string, number>();
    const uniqueDocs = new Set<string>();

    // First pass: ensure minimum distinct documents
    for (const chunk of sorted) {
        const docCount = docCounts.get(chunk.documentId) || 0;

        if (docCount < maxPerDocument) {
            result.push(chunk);
            docCounts.set(chunk.documentId, docCount + 1);
            uniqueDocs.add(chunk.documentId);
        }

        // Continue until we have minimum distinct docs
        if (uniqueDocs.size >= minDistinctDocs && result.length >= 20) {
            break;
        }
    }

    // Second pass: fill up with remaining high-scoring chunks
    for (const chunk of sorted) {
        if (result.find(c => c.chunkId === chunk.chunkId)) continue;

        const docCount = docCounts.get(chunk.documentId) || 0;
        if (docCount < maxPerDocument) {
            result.push(chunk);
            docCounts.set(chunk.documentId, docCount + 1);
        }

        if (result.length >= 200) break;
    }

    return result;
}

export { vectorSearch, keywordSearch };
