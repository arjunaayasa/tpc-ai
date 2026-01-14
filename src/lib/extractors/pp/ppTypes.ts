/**
 * PP Types - Type definitions for PP (Peraturan Pemerintah) document extraction
 */

import { ChunkType } from '@prisma/client';

// Source part of PP document
export type SourcePart = 'BATANG_TUBUH' | 'PENJELASAN';

// PP-specific chunk types
export type PpChunkType =
    | 'PREAMBLE'      // Header/Identitas
    | 'MENIMBANG'
    | 'MENGINGAT'
    | 'PENETAPAN'
    | 'PASAL'
    | 'AYAT'
    | 'PENUTUP'
    | 'PENJELASAN_UMUM'
    | 'PENJELASAN_PASAL'
    | 'PENJELASAN_AYAT';

// PP Document Identity
export interface PpIdentity {
    nomor: string | null;       // e.g., "23"
    tahun: number | null;
    tentang: string | null;
    tanggalDitetapkan: string | null;
    tanggalDiundangkan: string | null;
}

// PP Section (large structural divisions)
export interface PpSection {
    type: PpChunkType;
    title: string;
    startOffset: number;
    endOffset: number;
    text: string;
    sourcePart: SourcePart;
}

// PP Chunk (atomic unit for embedding)
export interface PpChunk {
    chunkType: PpChunkType;
    title: string | null;
    anchorCitation: string;
    text: string;
    orderIndex: number;
    parentId?: string;
    sourcePart: SourcePart;
    // Hierarchy fields
    pasal?: string;
    ayat?: string;
    huruf?: string;
    // Legal references
    legalRefs?: string[];
    tokenEstimate: number;
}

// PP Parse Result
export interface PpParseResult {
    identity: PpIdentity;
    sections: PpSection[];
    chunks: PpChunk[];
    legalRefs: string[];
}

/**
 * Convert PpChunk to database format
 */
export function ppChunkToDbFormat(chunk: PpChunk): {
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
        pasal: chunk.pasal || null,
        ayat: chunk.ayat || null,
        huruf: chunk.huruf || null,
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
        sourcePart: chunk.sourcePart,
    };
}
