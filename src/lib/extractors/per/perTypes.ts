/**
 * PER Types - Type definitions for PER document extraction
 */

import { ChunkType } from '@prisma/client';

// PER Subtypes
export type PerSubtype = 'PER_NASKAH' | 'PER_SALINDIA';

// PER-specific chunk types
export type PerChunkType =
    | 'PREAMBLE'
    | 'MENIMBANG'
    | 'MENGINGAT'
    | 'PENETAPAN'
    | 'BAB'
    | 'BAGIAN'
    | 'PARAGRAF'
    | 'PASAL'
    | 'AYAT'
    | 'LAMPIRAN'
    | 'LAMPIRAN_SECTION'
    | 'HEADING_SECTION'
    | 'PENUTUP';

// PER Document Identity
export interface PerIdentity {
    nomor: string | null;       // e.g., "PER-11/PJ/2015"
    tahun: number | null;
    tentang: string | null;
    tanggalTerbit: string | null;
    tanggalBerlaku: string | null;
}

// PER Section (large structural divisions)
export interface PerSection {
    type: PerChunkType;
    title: string;
    startOffset: number;
    endOffset: number;
    text: string;
}

// PER Chunk (atomic unit for embedding)
export interface PerChunk {
    chunkType: PerChunkType;
    title: string | null;
    anchorCitation: string;
    text: string;
    orderIndex: number;
    parentId?: string;
    // Hierarchy fields
    bab?: string;
    bagian?: string;
    paragraf?: string;
    pasal?: string;
    ayat?: string;
    // Legal references
    legalRefs?: string[];
    tokenEstimate: number;
}

// PER Parse Result
export interface PerParseResult {
    subtype: PerSubtype;
    identity: PerIdentity;
    sections: PerSection[];
    chunks: PerChunk[];
    legalRefs: string[];
}

/**
 * Convert PerChunk to database format
 */
export function perChunkToDbFormat(chunk: PerChunk): {
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
} {
    return {
        anchorCitation: chunk.anchorCitation,
        pasal: chunk.pasal || null,
        ayat: chunk.ayat || null,
        huruf: null,
        bab: chunk.bab || null,
        bagian: chunk.bagian || null,
        paragraf: chunk.paragraf || null,
        chunkType: chunk.chunkType as ChunkType,
        role: 'UNKNOWN',
        title: chunk.title,
        parentChunkId: chunk.parentId || null,
        legalRefs: chunk.legalRefs && chunk.legalRefs.length > 0 ? { refs: chunk.legalRefs } : null,
        orderIndex: chunk.orderIndex,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
    };
}
