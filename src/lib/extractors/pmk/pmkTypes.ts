/**
 * PMK Types - Type definitions for PMK document parsing
 */

export type PmkSubtype = 'PMK_NASKAH' | 'PMK_PUBLIKASI';

export type PmkChunkType =
    | 'PREAMBLE'      // Header/identitas
    | 'MENIMBANG'     // Menimbang block
    | 'MENGINGAT'     // Mengingat block
    | 'PENETAPAN'     // MEMUTUSKAN/Menetapkan
    | 'BAB'           // BAB header
    | 'BAGIAN'        // Bagian header
    | 'PASAL'         // Pasal
    | 'AYAT'          // Ayat dalam pasal
    | 'PENUTUP'       // Ketentuan penutup
    | 'HEADING_SECTION'; // For publikasi

export interface PmkIdentity {
    nomor: string | null;           // e.g., "168/PMK.010/2023"
    tahun: number | null;
    tentang: string | null;         // Subject of the regulation
    tanggalTerbit: string | null;   // e.g., "29 Desember 2023"
    tanggalBerlaku: string | null;
}

export interface PmkSection {
    type: PmkChunkType;
    title: string;
    startOffset: number;
    endOffset: number;
    text: string;
}

export interface PmkChunk {
    chunkType: PmkChunkType;
    title: string;
    anchorCitation: string;
    text: string;
    orderIndex: number;
    pasal?: string;      // e.g., "21"
    ayat?: string;       // e.g., "1"
    bab?: string;        // e.g., "I"
    bagian?: string;     // e.g., "Kesatu"
    parentId?: string;
    legalRefs?: string[];
    tokenEstimate: number;
}

export interface PmkParseResult {
    subtype: PmkSubtype;
    identity: PmkIdentity;
    sections: PmkSection[];
    chunks: PmkChunk[];
    legalRefs?: string[];
}

/**
 * Convert PmkChunk to database-compatible format
 */
export function pmkChunkToDbFormat(chunk: PmkChunk): {
    anchorCitation: string;
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    bab: string | null;
    bagian: string | null;
    chunkType: 'PREAMBLE' | 'PASAL' | 'AYAT' | 'SECTION' | 'SUBSECTION' | 'EVIDENCE' | 'AMAR' | 'BAB' | 'SUBBAB' | 'MENIMBANG' | 'MENGINGAT' | 'PENETAPAN' | 'BAGIAN' | 'HEADING_SECTION' | 'PENUTUP';
    role: 'MAJELIS' | 'PEMOHON' | 'TERBANDING' | 'UNKNOWN';
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
        chunkType: chunk.chunkType as 'PREAMBLE' | 'PASAL' | 'AYAT' | 'SECTION' | 'SUBSECTION' | 'EVIDENCE' | 'AMAR' | 'BAB' | 'SUBBAB' | 'MENIMBANG' | 'MENGINGAT' | 'PENETAPAN' | 'BAGIAN' | 'HEADING_SECTION' | 'PENUTUP',
        role: 'UNKNOWN' as const,
        title: chunk.title,
        parentChunkId: chunk.parentId || null,
        legalRefs: chunk.legalRefs && chunk.legalRefs.length > 0 ? { refs: chunk.legalRefs } : null,
        orderIndex: chunk.orderIndex,
        text: chunk.text,
        tokenEstimate: chunk.tokenEstimate,
    };
}
