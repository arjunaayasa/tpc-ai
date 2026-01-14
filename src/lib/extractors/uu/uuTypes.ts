/**
 * UU Types - Type definitions for UU (Undang-Undang) extraction
 * Structure identical to PERPU: BAB → Bagian → Paragraf → Pasal → Ayat → Huruf
 */

export type SourcePart = 'BATANG_TUBUH' | 'PENJELASAN';

export type UuChunkType =
    | 'PREAMBLE'
    | 'MENIMBANG'
    | 'MENGINGAT'
    | 'PENETAPAN'
    | 'BAB'
    | 'BAGIAN'
    | 'PARAGRAF'
    | 'PASAL'
    | 'AYAT'
    | 'HURUF'
    | 'PENUTUP'
    | 'PENJELASAN_UMUM'
    | 'PENJELASAN_PASAL'
    | 'PENJELASAN_AYAT';

export interface UuIdentity {
    nomor: string | null;
    tahun: number | null;
    tentang: string | null;
    tanggalDitetapkan: string | null;
    tanggalDiundangkan: string | null;
}

export interface UuSection {
    type: 'BAB' | 'BAGIAN' | 'PARAGRAF';
    number: string;
    title: string;
    startOffset: number;
    endOffset: number;
    children: UuSection[];
}

export interface UuChunk {
    chunkType: UuChunkType;
    title: string;
    anchorCitation: string;
    text: string;
    orderIndex: number;
    sourcePart: SourcePart;
    bab?: string;
    bagian?: string;
    paragraf?: string;
    pasal?: string;
    ayat?: string;
    huruf?: string;
    legalRefs?: string[];
    tokenEstimate: number;
}

export interface UuParseResult {
    identity: UuIdentity;
    sections: UuSection[];
    chunks: UuChunk[];
    legalRefs: string[];
}

/**
 * Convert UuChunk to database format
 */
export function uuChunkToDbFormat(chunk: UuChunk, documentId: string): {
    documentId: string;
    anchorCitation: string;
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    chunkType: string;
    role: string;
    title: string | null;
    orderIndex: number;
    text: string;
    tokenEstimate: number;
} {
    return {
        documentId,
        anchorCitation: chunk.anchorCitation,
        pasal: chunk.pasal || null,
        ayat: chunk.ayat || null,
        huruf: chunk.huruf || null,
        chunkType: chunk.chunkType,
        role: 'UNKNOWN',
        title: chunk.title,
        orderIndex: chunk.orderIndex,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
    };
}
