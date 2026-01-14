/**
 * Nota Dinas Types - Type definitions for Nota Dinas document extraction
 */

import { ChunkType } from '@prisma/client';

// Nota Dinas-specific chunk types
export type NotaDinasChunkType =
    | 'ND_HEADER'
    | 'ND_PEMBUKA'
    | 'ND_ISI_ITEM'
    | 'ND_SUB_ITEM'
    | 'ND_SUB_SUB_ITEM'
    | 'ND_PENEGASAN'
    | 'ND_PENUTUP'
    | 'ND_LAMPIRAN_SECTION';

// Nota Dinas Document Identity
export interface NotaDinasIdentity {
    nomor: string | null;       // e.g., "ND-6/PJ.01/2021"
    tanggal: string | null;     // e.g., "5 Januari 2021"
    hal: string | null;         // Subject/topic
    sifat: string | null;       // e.g., "Biasa", "Segera", "Rahasia"
    dari: string | null;        // From
    kepada: string[];           // To (can be multiple)
    lampiran: string | null;    // Attachment count
}

// Nota Dinas Section
export interface NotaDinasSection {
    type: 'HEADER' | 'PEMBUKA' | 'ISI_POKOK' | 'PENEGASAN' | 'PENUTUP' | 'LAMPIRAN';
    title: string;
    startOffset: number;
    endOffset: number;
    text: string;
}

// Nota Dinas Chunk
export interface NotaDinasChunk {
    chunkType: NotaDinasChunkType;
    title: string | null;
    anchorCitation: string;
    text: string;
    orderIndex: number;
    parentId?: string;
    // Item fields
    itemNumber?: string;      // "1", "2", "3", etc.
    subItemLetter?: string;   // "a", "b", "c", etc.
    subSubItemNumber?: string; // "1)", "2)", etc.
    lampiranLetter?: string;  // "A", "B", "C" for lampiran sections
    // Legal references
    legalRefs?: string[];
    tokenEstimate: number;
}

// Nota Dinas Parse Result
export interface NotaDinasParseResult {
    identity: NotaDinasIdentity;
    sections: NotaDinasSection[];
    chunks: NotaDinasChunk[];
    legalRefs: string[];
}

/**
 * Convert NotaDinasChunk to database format
 */
export function notaDinasChunkToDbFormat(chunk: NotaDinasChunk): {
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
        ayat: chunk.subSubItemNumber || null,
        huruf: chunk.subItemLetter || null,
        bab: chunk.lampiranLetter || null,
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
