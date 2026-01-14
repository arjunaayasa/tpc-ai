/**
 * PERPU Types - Type definitions for PERPU (Peraturan Pemerintah Pengganti Undang-Undang)
 * Extends PP types since PERPU has identical structure to UU/PP
 */

import { ChunkType } from '@prisma/client';

// Source part of PERPU document (same as PP)
export type SourcePart = 'BATANG_TUBUH' | 'PENJELASAN';

// PERPU-specific chunk types (same as PP)
export type PerpuChunkType =
    | 'PREAMBLE'      // Header/Identitas
    | 'MENIMBANG'
    | 'MENGINGAT'
    | 'PENETAPAN'
    | 'BAB'           // BAB level (UU-style hierarchy)
    | 'BAGIAN'        // Bagian level
    | 'PARAGRAF'      // Paragraf level
    | 'PASAL'
    | 'AYAT'
    | 'HURUF'
    | 'PENUTUP'
    | 'PENJELASAN_UMUM'
    | 'PENJELASAN_PASAL'
    | 'PENJELASAN_AYAT';

// PERPU lifecycle status
export type PerpuStatus = 'BERLAKU' | 'DITETAPKAN_JADI_UU' | 'DICABUT';

// PERPU Document Identity
export interface PerpuIdentity {
    nomor: string | null;       // e.g., "1"
    tahun: number | null;
    tentang: string | null;
    tanggalDitetapkan: string | null;
    tanggalDiundangkan: string | null;
    status: PerpuStatus;        // PERPU-specific lifecycle status
}

// PERPU Section (large structural divisions)
export interface PerpuSection {
    type: PerpuChunkType;
    title: string;
    startOffset: number;
    endOffset: number;
    text: string;
    sourcePart: SourcePart;
}

// PERPU Chunk (atomic unit for embedding)
export interface PerpuChunk {
    chunkType: PerpuChunkType;
    title: string | null;
    anchorCitation: string;
    text: string;
    orderIndex: number;
    parentId?: string;
    sourcePart: SourcePart;
    // Hierarchy fields
    bab?: string;
    bagian?: string;
    paragraf?: string;
    pasal?: string;
    ayat?: string;
    huruf?: string;
    // Legal references
    legalRefs?: string[];
    tokenEstimate: number;
}

// PERPU Parse Result
export interface PerpuParseResult {
    identity: PerpuIdentity;
    sections: PerpuSection[];
    chunks: PerpuChunk[];
    legalRefs: string[];
}

/**
 * Convert PerpuChunk to database format
 */
export function perpuChunkToDbFormat(chunk: PerpuChunk): {
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
        sourcePart: chunk.sourcePart,
    };
}
