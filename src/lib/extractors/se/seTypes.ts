/**
 * SE Types - Type definitions for SE (Surat Edaran) document extraction
 */

import { ChunkType } from '@prisma/client';

// SE-specific chunk types
export type SeChunkType =
    | 'PREAMBLE'      // Header
    | 'SECTION'       // Pembuka / Isi Pokok / Penutup
    | 'SUBSECTION';   // Sub-items

// SE Document Identity
export interface SeIdentity {
    nomor: string | null;       // e.g., "SE-11/PJ.42/1992"
    tahun: number | null;
    tentang: string | null;
}

// SE Section
export interface SeSection {
    type: 'HEADER' | 'PEMBUKA' | 'ISI_POKOK' | 'PENUTUP';
    title: string;
    startOffset: number;
    endOffset: number;
    text: string;
}

// SE Chunk
export interface SeChunk {
    chunkType: SeChunkType;
    title: string | null;
    anchorCitation: string;
    text: string;
    orderIndex: number;
    parentId?: string;
    // Item fields
    itemNumber?: string;      // "1", "2", "3", etc.
    subItemLetter?: string;   // "a", "b", "c", etc.
    // Legal references
    legalRefs?: string[];
    tokenEstimate: number;
}

// SE Parse Result
export interface SeParseResult {
    identity: SeIdentity;
    sections: SeSection[];
    chunks: SeChunk[];
    legalRefs: string[];
}

/**
 * Convert SeChunk to database format
 */
export function seChunkToDbFormat(chunk: SeChunk): {
    anchorCitation: string;
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    bab: string | null;
    bagian: string | null;
    paragraf: string | null;
    chunkType: ChunkType;
    role: 'UNKNOWN';
    title: string | null;
    parentChunkId: string | null;
    legalRefs: object | null;
    orderIndex: number;
    text: string;
    tokenEstimate: number;
    sourcePart: string | null;
} {
    return {
        anchorCitation: chunk.anchorCitation,
        pasal: chunk.itemNumber || null,
        ayat: null,
        huruf: chunk.subItemLetter || null,
        bab: null,
        bagian: null,
        paragraf: null,
        chunkType: chunk.chunkType as ChunkType,
        role: 'UNKNOWN',
        title: chunk.title,
        parentChunkId: chunk.parentId || null,
        legalRefs: chunk.legalRefs && chunk.legalRefs.length > 0 ? { refs: chunk.legalRefs } : null,
        orderIndex: chunk.orderIndex,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
        sourcePart: null,
    };
}
