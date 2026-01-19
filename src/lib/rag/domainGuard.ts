/**
 * Legal Domain Guard
 * Filters out documents that are not related to tax domain
 * Prevents citation hallucination from wrong legal domains
 */

import { ChunkCandidate, DocumentType } from './types';

// ============== TAX DOMAIN KEYWORDS ==============

// Keywords in document titles that indicate TAX domain
const TAX_DOMAIN_KEYWORDS = [
    // Tax types
    'pajak', 'perpajakan', 'pph', 'ppn', 'ppnbm', 'pbb', 'bphtb',
    'bea materai', 'materai', 'cukai',
    // Tax institutions
    'djp', 'direktorat jenderal pajak', 'fiskus', 'wajib pajak',
    // Tax procedures
    'spt', 'faktur', 'npwp', 'pkp', 'skp', 'skpkb', 'skplb',
    'pemeriksaan pajak', 'penagihan pajak', 'keberatan', 'banding',
    // Tax laws
    'ketentuan umum', 'kup', 'hpp', 'harga transfer', 'transfer pricing',
    'withholding', 'pemotongan', 'pemungutan',
    // Tax objects
    'penghasilan', 'dividen', 'royalti', 'bunga', 'sewa',
    'ptkp', 'tarif', 'ter ', ' ter',
];

// Document types that are always TAX domain
const ALWAYS_TAX_DOC_TYPES: DocumentType[] = [
    'PMK', 'PER', 'SE', 'NOTA_DINAS', 'KEP',
];

// UU/PP that are NOT tax related (blacklist)
const NON_TAX_REGULATIONS: Array<{ jenis: string; nomor?: string; tahun?: number; pattern?: RegExp }> = [
    // Pesisir dan Kelautan
    { jenis: 'UU', nomor: '1', tahun: 2014 },
    { jenis: 'UU', pattern: /pesisir|pulau|kelautan|maritim/i },
    // Cipta Kerja (use tax-specific sections only)
    { jenis: 'UU', nomor: '11', tahun: 2020 },
    { jenis: 'UU', nomor: '6', tahun: 2023 }, // Perppu Cipta Kerja
    { jenis: 'PERPU', nomor: '2', tahun: 2022 },
    // Perbankan
    { jenis: 'UU', pattern: /perbankan|bank indonesia|otoritas jasa/i },
    // Agraria
    { jenis: 'UU', pattern: /agraria|pertanahan/i },
    // Lingkungan
    { jenis: 'UU', pattern: /lingkungan hidup/i },
    // Pendidikan
    { jenis: 'UU', pattern: /pendidikan|guru|perguruan tinggi/i },
    // Kesehatan
    { jenis: 'UU', pattern: /kesehatan|farmasi|obat|rumah sakit/i },
    // Ketenagakerjaan (kecuali terkait PPh 21)
    { jenis: 'UU', pattern: /ketenagakerjaan|tenaga kerja|cipta kerja/i },
    // Pemda
    { jenis: 'UU', pattern: /pemerintah daerah|otonomi|desentralisasi/i },
];

// Known TAX regulations (whitelist)
const TAX_REGULATIONS: Array<{ jenis: string; nomor?: string; tahun?: number; pattern?: RegExp }> = [
    // UU Pajak Penghasilan
    { jenis: 'UU', nomor: '7', tahun: 1983 },
    { jenis: 'UU', nomor: '7', tahun: 1991 },
    { jenis: 'UU', nomor: '10', tahun: 1994 },
    { jenis: 'UU', nomor: '17', tahun: 2000 },
    { jenis: 'UU', nomor: '36', tahun: 2008 },
    // UU HPP
    { jenis: 'UU', nomor: '7', tahun: 2021 },
    // UU PPN
    { jenis: 'UU', nomor: '8', tahun: 1983 },
    { jenis: 'UU', nomor: '11', tahun: 1994 },
    { jenis: 'UU', nomor: '18', tahun: 2000 },
    { jenis: 'UU', nomor: '42', tahun: 2009 },
    // UU KUP
    { jenis: 'UU', nomor: '6', tahun: 1983 },
    { jenis: 'UU', nomor: '9', tahun: 1994 },
    { jenis: 'UU', nomor: '16', tahun: 2000 },
    { jenis: 'UU', nomor: '28', tahun: 2007 },
    // PP Pajak
    { jenis: 'PP', nomor: '58', tahun: 2023 }, // TER
    { jenis: 'PP', nomor: '55', tahun: 2022 },
    { jenis: 'PP', pattern: /pajak|pph|ppn|ptkp|tarif/i },
    // UU dengan keyword pajak
    { jenis: 'UU', pattern: /pajak|harmonisasi|pph|ppn/i },
];

// Strong tax keywords that override blacklist (these definitively indicate tax content)
const STRONG_TAX_KEYWORDS = [
    'pph pasal 21', 'pph pasal 23', 'pph pasal 26', 'pph pasal 4(2)',
    'pasal 17 ayat', 'tarif efektif', 'tarif progresif',
    'pemotongan pajak', 'pemungutan pajak', 'withholding tax',
    'ptkp', 'penghasilan tidak kena pajak',
    'faktur pajak', 'npwp', 'spt',
    'pajak penghasilan', 'pajak pertambahan nilai',
];

/**
 * Check if text contains STRONG tax keywords (override blacklist)
 */
function hasStrongTaxKeywords(text: string | null | undefined): boolean {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return STRONG_TAX_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// ============== MAIN FUNCTION ==============

/**
 * Filter chunks to only include tax-domain documents
 */
export function filterTaxDomain(chunks: ChunkCandidate[]): ChunkCandidate[] {
    console.log(`[DomainGuard] Checking ${chunks.length} chunks`);

    const filtered = chunks.filter(chunk => {
        const result = isTaxDomain(chunk);
        if (!result) {
            console.log(`[DomainGuard] REJECTED: ${chunk.docType} ${chunk.docNumber}/${chunk.docYear} - ${chunk.docTitle?.substring(0, 50)}`);
        }
        return result;
    });

    const rejectedCount = chunks.length - filtered.length;
    if (rejectedCount > 0) {
        console.log(`[DomainGuard] Filtered out ${rejectedCount} non-tax chunks`);
    }

    return filtered;
}

/**
 * Check if a chunk is from tax domain
 * Uses two-stage check: title/domain prior + content override
 */
export function isTaxDomain(chunk: ChunkCandidate): boolean {
    // 1. PMK, PER, SE, NOTA_DINAS, KEP are always tax domain
    if (ALWAYS_TAX_DOC_TYPES.includes(chunk.docType)) {
        return true;
    }

    // 2. Check whitelist first (explicit tax regulations)
    if (isWhitelisted(chunk)) {
        return true;
    }

    // 3. Check blacklist - BUT with content override
    if (isBlacklisted(chunk)) {
        // CONTENT OVERRIDE: If chunk has STRONG tax keywords, allow it anyway
        // This handles cases like Cipta Kerja which has tax-related provisions
        if (hasStrongTaxKeywords(chunk.text)) {
            console.log(`[DomainGuard] OVERRIDE: ${chunk.docType} ${chunk.docNumber}/${chunk.docYear} - has strong tax content`);
            return true;
        }
        return false;
    }

    // 4. Check title for tax keywords
    if (hasTaxKeywords(chunk.docTitle)) {
        return true;
    }

    // 5. Check chunk text for tax keywords (be more lenient for UU/PP)
    if (['UU', 'PP', 'PERPU'].includes(chunk.docType)) {
        // For UU/PP without clear indicators, check if text content is tax-related
        if (hasTaxKeywords(chunk.text.substring(0, 500))) {
            return true;
        }
        // Default: reject unclear UU/PP to be safe
        return false;
    }

    // 6. BUKU and PUTUSAN - check title OR content
    if (['BUKU', 'PUTUSAN'].includes(chunk.docType)) {
        return hasTaxKeywords(chunk.docTitle) || hasTaxKeywords(chunk.text.substring(0, 300));
    }

    // Default: allow (for unknown types)
    return true;
}

/**
 * Check if document is in blacklist
 */
function isBlacklisted(chunk: ChunkCandidate): boolean {
    for (const rule of NON_TAX_REGULATIONS) {
        if (chunk.docType !== rule.jenis) continue;

        // Match by nomor and tahun
        if (rule.nomor && rule.tahun) {
            if (chunk.docNumber === rule.nomor && chunk.docYear === rule.tahun) {
                return true;
            }
        }

        // Match by pattern in title
        if (rule.pattern && chunk.docTitle) {
            if (rule.pattern.test(chunk.docTitle)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Check if document is in whitelist
 */
function isWhitelisted(chunk: ChunkCandidate): boolean {
    for (const rule of TAX_REGULATIONS) {
        if (chunk.docType !== rule.jenis) continue;

        // Match by nomor and tahun
        if (rule.nomor && rule.tahun) {
            if (chunk.docNumber === rule.nomor && chunk.docYear === rule.tahun) {
                return true;
            }
        }

        // Match by pattern in title
        if (rule.pattern && chunk.docTitle) {
            if (rule.pattern.test(chunk.docTitle)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Check if text contains tax keywords
 */
function hasTaxKeywords(text: string | null | undefined): boolean {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return TAX_DOMAIN_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Get validation summary for a chunk
 */
export function getChunkValidation(chunk: ChunkCandidate): {
    isValid: boolean;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
} {
    if (ALWAYS_TAX_DOC_TYPES.includes(chunk.docType)) {
        return { isValid: true, reason: 'Tax regulation type', confidence: 'high' };
    }

    if (isBlacklisted(chunk)) {
        return { isValid: false, reason: 'Blacklisted non-tax regulation', confidence: 'high' };
    }

    if (isWhitelisted(chunk)) {
        return { isValid: true, reason: 'Whitelisted tax regulation', confidence: 'high' };
    }

    if (hasTaxKeywords(chunk.docTitle)) {
        return { isValid: true, reason: 'Title contains tax keywords', confidence: 'medium' };
    }

    if (hasTaxKeywords(chunk.text.substring(0, 500))) {
        return { isValid: true, reason: 'Content contains tax keywords', confidence: 'low' };
    }

    return { isValid: false, reason: 'No tax domain indicators', confidence: 'medium' };
}
