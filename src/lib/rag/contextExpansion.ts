/**
 * Context Expansion - Expands chunks with parent/sibling/penjelasan
 * Implements legal hierarchy expansion rules
 */

import { PrismaClient } from '@prisma/client';
import { ChunkCandidate, IntentType, DocumentType } from './types';

const prisma = new PrismaClient();

// ============== MAIN FUNCTION ==============

/**
 * Expand context by adding parent, sibling, and penjelasan chunks
 */
export async function expandContext(
    chunks: ChunkCandidate[],
    intent: IntentType[],
    maxChunks: number = 20
): Promise<ChunkCandidate[]> {
    console.log(`[ContextExpansion] Starting with ${chunks.length} chunks`);

    const expanded = new Map<string, ChunkCandidate>();

    // Add original chunks
    for (const chunk of chunks) {
        expanded.set(chunk.chunkId, chunk);
    }

    // Track which chunks need what expansion
    const needsParent: ChunkCandidate[] = [];
    const needsSiblings: ChunkCandidate[] = [];
    const needsPenjelasan: ChunkCandidate[] = [];

    for (const chunk of chunks) {
        // If chunk is AYAT or HURUF, get parent PASAL
        if (['AYAT', 'HURUF'].includes(chunk.chunkType)) {
            needsParent.push(chunk);
        }

        // If asking for definition/explanation, get penjelasan
        if (intent.includes('definisi') || intent.includes('ketentuan_pasal')) {
            if (['PASAL', 'AYAT'].includes(chunk.chunkType)) {
                needsPenjelasan.push(chunk);
            }
        }

        // Get sibling ayat for context
        if (chunk.chunkType === 'AYAT') {
            needsSiblings.push(chunk);
        }
    }

    // 1. Expand parents
    if (needsParent.length > 0) {
        const parents = await fetchParentChunks(needsParent);
        for (const parent of parents) {
            if (!expanded.has(parent.chunkId)) {
                parent.isExpanded = true;
                parent.expandedFrom = 'parent';
                expanded.set(parent.chunkId, parent);
            }
        }
        console.log(`[ContextExpansion] Added ${parents.length} parent chunks`);
    }

    // 2. Expand siblings (±1)
    if (needsSiblings.length > 0) {
        const siblings = await fetchSiblingChunks(needsSiblings, 1);
        for (const sibling of siblings) {
            if (!expanded.has(sibling.chunkId)) {
                sibling.isExpanded = true;
                sibling.expandedFrom = 'sibling';
                expanded.set(sibling.chunkId, sibling);
            }
        }
        console.log(`[ContextExpansion] Added ${siblings.length} sibling chunks`);
    }

    // 3. Expand penjelasan
    if (needsPenjelasan.length > 0) {
        const penjelasan = await fetchPenjelasanChunks(needsPenjelasan);
        for (const p of penjelasan) {
            if (!expanded.has(p.chunkId)) {
                p.isExpanded = true;
                p.expandedFrom = 'penjelasan';
                expanded.set(p.chunkId, p);
            }
        }
        console.log(`[ContextExpansion] Added ${penjelasan.length} penjelasan chunks`);
    }

    // Convert to array and limit
    let result = Array.from(expanded.values());

    // Sort: original chunks first (higher score), then expanded
    result.sort((a, b) => {
        if (a.isExpanded && !b.isExpanded) return 1;
        if (!a.isExpanded && b.isExpanded) return -1;
        return b.finalScore - a.finalScore;
    });

    // Limit to max
    if (result.length > maxChunks) {
        result = result.slice(0, maxChunks);
    }

    console.log(`[ContextExpansion] Final: ${result.length} chunks`);
    return result;
}

// ============== FETCH FUNCTIONS ==============

/**
 * Fetch parent PASAL chunks for AYAT/HURUF chunks
 */
async function fetchParentChunks(chunks: ChunkCandidate[]): Promise<ChunkCandidate[]> {
    const results: ChunkCandidate[] = [];

    for (const chunk of chunks) {
        if (!chunk.pasal) continue;

        // Find PASAL chunk in same document
        const parent = await prisma.regulationChunk.findFirst({
            where: {
                documentId: chunk.documentId,
                chunkType: 'PASAL',
                pasal: chunk.pasal,
                ayat: null, // Pure pasal, not ayat
            },
            include: {
                document: {
                    include: { metadata: true }
                }
            }
        });

        if (parent) {
            results.push(chunkToCandidate(parent));
        }
    }

    return results;
}

/**
 * Fetch sibling AYAT chunks (±window)
 */
async function fetchSiblingChunks(
    chunks: ChunkCandidate[],
    window: number = 1
): Promise<ChunkCandidate[]> {
    const results: ChunkCandidate[] = [];

    for (const chunk of chunks) {
        if (!chunk.pasal || !chunk.ayat) continue;

        const ayatNum = parseInt(chunk.ayat);
        if (isNaN(ayatNum)) continue;

        // Find adjacent ayat in same document and pasal
        const siblings = await prisma.regulationChunk.findMany({
            where: {
                documentId: chunk.documentId,
                chunkType: 'AYAT',
                pasal: chunk.pasal,
                ayat: {
                    in: Array.from({ length: window * 2 + 1 }, (_, i) =>
                        String(ayatNum - window + i)
                    ).filter(a => a !== chunk.ayat && parseInt(a) > 0)
                }
            },
            include: {
                document: {
                    include: { metadata: true }
                }
            }
        });

        for (const sibling of siblings) {
            results.push(chunkToCandidate(sibling));
        }
    }

    return results;
}

/**
 * Fetch PENJELASAN_PASAL or PENJELASAN_AYAT for given PASAL/AYAT chunks
 */
async function fetchPenjelasanChunks(chunks: ChunkCandidate[]): Promise<ChunkCandidate[]> {
    const results: ChunkCandidate[] = [];

    for (const chunk of chunks) {
        if (!chunk.pasal) continue;

        // Find penjelasan in same document
        const penjelasanType = chunk.chunkType === 'AYAT' ? 'PENJELASAN_AYAT' : 'PENJELASAN_PASAL';

        const penjelasan = await prisma.regulationChunk.findFirst({
            where: {
                documentId: chunk.documentId,
                chunkType: penjelasanType,
                pasal: chunk.pasal,
                ...(chunk.ayat && { ayat: chunk.ayat }),
            },
            include: {
                document: {
                    include: { metadata: true }
                }
            }
        });

        if (penjelasan) {
            results.push(chunkToCandidate(penjelasan));
        }

        // Also try generic PENJELASAN_PASAL if AYAT penjelasan not found
        if (!penjelasan && chunk.chunkType === 'AYAT') {
            const pasalPenjelasan = await prisma.regulationChunk.findFirst({
                where: {
                    documentId: chunk.documentId,
                    chunkType: 'PENJELASAN_PASAL',
                    pasal: chunk.pasal,
                },
                include: {
                    document: {
                        include: { metadata: true }
                    }
                }
            });

            if (pasalPenjelasan) {
                results.push(chunkToCandidate(pasalPenjelasan));
            }
        }
    }

    return results;
}

// ============== HELPERS ==============

type ChunkWithDoc = {
    id: string;
    documentId: string;
    anchorCitation: string;
    chunkType: string;
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    text: string;
    tokenEstimate: number | null;
    document: {
        metadata: {
            jenis: string;
            nomor: string | null;
            tahun: number | null;
            judul: string | null;
            statusAturan: string;
        } | null;
    };
};

function chunkToCandidate(chunk: ChunkWithDoc): ChunkCandidate {
    const meta = chunk.document.metadata;
    return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        anchorCitation: chunk.anchorCitation,
        chunkType: chunk.chunkType,
        pasal: chunk.pasal,
        ayat: chunk.ayat,
        huruf: chunk.huruf,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
        vectorScore: 0,
        keywordScore: 0,
        finalScore: 0.5, // Default score for expanded chunks
        docType: (meta?.jenis || 'UNKNOWN') as DocumentType,
        docNumber: meta?.nomor || null,
        docYear: meta?.tahun || null,
        docTitle: meta?.judul || null,
        statusAturan: meta?.statusAturan || 'unknown',
    };
}

/**
 * Apply expansion configuration from sufficiency check
 */
export async function applyExpansionConfig(
    chunks: ChunkCandidate[],
    config: {
        expand_parent: boolean;
        expand_siblings_window: 0 | 1 | 2;
        expand_penjelasan_for_same_pasal: boolean;
    }
): Promise<ChunkCandidate[]> {
    const expanded = new Map<string, ChunkCandidate>();

    for (const chunk of chunks) {
        expanded.set(chunk.chunkId, chunk);
    }

    if (config.expand_parent) {
        const ayatHurufChunks = chunks.filter(c =>
            ['AYAT', 'HURUF'].includes(c.chunkType)
        );
        const parents = await fetchParentChunks(ayatHurufChunks);
        for (const p of parents) {
            if (!expanded.has(p.chunkId)) {
                p.isExpanded = true;
                expanded.set(p.chunkId, p);
            }
        }
    }

    if (config.expand_siblings_window > 0) {
        const ayatChunks = chunks.filter(c => c.chunkType === 'AYAT');
        const siblings = await fetchSiblingChunks(ayatChunks, config.expand_siblings_window);
        for (const s of siblings) {
            if (!expanded.has(s.chunkId)) {
                s.isExpanded = true;
                expanded.set(s.chunkId, s);
            }
        }
    }

    if (config.expand_penjelasan_for_same_pasal) {
        const pasalAyatChunks = chunks.filter(c =>
            ['PASAL', 'AYAT'].includes(c.chunkType)
        );
        const penjelasan = await fetchPenjelasanChunks(pasalAyatChunks);
        for (const p of penjelasan) {
            if (!expanded.has(p.chunkId)) {
                p.isExpanded = true;
                expanded.set(p.chunkId, p);
            }
        }
    }

    return Array.from(expanded.values());
}
