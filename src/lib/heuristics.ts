// Local type definitions matching Prisma schema
type RegulationType = 'UU' | 'PP' | 'PMK' | 'PER' | 'SE' | 'KEP' | 'UNKNOWN';
type RegulationStatus = 'berlaku' | 'diubah' | 'dicabut' | 'unknown';

export interface ExtractedMetadata {
    jenis: RegulationType;
    nomor: string | null;
    tahun: number | null;
    judul: string | null;
    tanggalTerbit: Date | null;
    tanggalBerlaku: Date | null;
    statusAturan: RegulationStatus;
    confidence: number;
    extractionNotes: Record<string, unknown>;
}

// Regex patterns for Indonesian tax regulations
const PATTERNS = {
    // Jenis dokumen patterns
    jenisPatterns: [
        { regex: /\bUNDANG[- ]?UNDANG\b/i, type: 'UU' as const },
        { regex: /\bUU\s*(?:NOMOR|NO\.?|:)\s*\d+/i, type: 'UU' as const },
        { regex: /\bPERATURAN\s+PEMERINTAH\b/i, type: 'PP' as const },
        { regex: /\bPP\s*(?:NOMOR|NO\.?|:)\s*\d+/i, type: 'PP' as const },
        { regex: /\bPERATURAN\s+MENTERI\s+KEUANGAN\b/i, type: 'PMK' as const },
        { regex: /\bPMK\s*(?:NOMOR|NO\.?|:)\s*\d+/i, type: 'PMK' as const },
        { regex: /\bPERATURAN\s+DIREKTUR\s+JENDERAL\b/i, type: 'PER' as const },
        { regex: /\bPER[- ]?\d+\/PJ/i, type: 'PER' as const },
        { regex: /\bSURAT\s+EDARAN\b/i, type: 'SE' as const },
        { regex: /\bSE[- ]?\d+\/PJ/i, type: 'SE' as const },
        { regex: /\bKEPUTUSAN\b/i, type: 'KEP' as const },
        { regex: /\bKEP[- ]?\d+/i, type: 'KEP' as const },
    ],

    // Nomor dokumen pattern
    nomorPattern: /(?:NOMOR|NO\.?)\s*:?\s*([\d\/\-\.A-Z]+)/i,

    // Tahun pattern (4 digit year)
    tahunPattern: /\b(19\d{2}|20\d{2})\b/g,

    // Indonesian date patterns
    datePatterns: [
        // Format: tanggal bulan tahun (e.g., "1 Januari 2024")
        /(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(19\d{2}|20\d{2})/gi,
        // Format: DD-MM-YYYY or DD/MM/YYYY
        /(\d{1,2})[-\/](\d{1,2})[-\/](19\d{2}|20\d{2})/g,
    ],

    // Status aturan patterns
    statusPatterns: [
        { regex: /\b(?:dicabut|tidak\s+berlaku)\b/i, status: 'dicabut' as const },
        { regex: /\b(?:diubah|perubahan|mengubah)\b/i, status: 'diubah' as const },
        { regex: /\b(?:berlaku|mulai\s+berlaku)\b/i, status: 'berlaku' as const },
    ],
};

const MONTH_MAP: Record<string, number> = {
    'januari': 0, 'februari': 1, 'maret': 2, 'april': 3,
    'mei': 4, 'juni': 5, 'juli': 6, 'agustus': 7,
    'september': 8, 'oktober': 9, 'november': 10, 'desember': 11,
};

/**
 * Extract jenis dokumen from text
 */
function extractJenis(text: string): RegulationType {
    for (const { regex, type } of PATTERNS.jenisPatterns) {
        if (regex.test(text)) {
            return type;
        }
    }
    return 'UNKNOWN';
}

/**
 * Extract nomor dokumen from text
 */
function extractNomor(text: string): string | null {
    const match = text.match(PATTERNS.nomorPattern);
    if (match && match[1]) {
        return match[1].trim();
    }
    return null;
}

/**
 * Extract tahun from text (most common 4-digit year)
 */
function extractTahun(text: string): number | null {
    const matches = text.match(PATTERNS.tahunPattern);
    if (matches && matches.length > 0) {
        // Return the first year found that's reasonable (2000-2030 or 1990-1999)
        for (const match of matches) {
            const year = parseInt(match, 10);
            if (year >= 1990 && year <= 2030) {
                return year;
            }
        }
        return parseInt(matches[0], 10);
    }
    return null;
}

/**
 * Extract judul from text (look for header-like text near the start)
 */
function extractJudul(text: string): string | null {
    // Look for "TENTANG" which usually precedes the title
    const tentangMatch = text.match(/TENTANG\s+([^\n]+)/i);
    if (tentangMatch && tentangMatch[1]) {
        return tentangMatch[1].trim().substring(0, 500);
    }

    // Try to find a capitalized header-like text in first 500 chars
    const firstPart = text.substring(0, 500);
    const lines = firstPart.split(/\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        // Look for lines that are mostly uppercase and not too short
        if (trimmed.length > 20 && trimmed.length < 300) {
            const uppercaseRatio = (trimmed.match(/[A-Z]/g) || []).length / trimmed.length;
            if (uppercaseRatio > 0.5) {
                return trimmed;
            }
        }
    }

    return null;
}

/**
 * Parse Indonesian date string to Date object
 */
function parseIndonesianDate(dateStr: string): Date | null {
    // Try format: "1 Januari 2024"
    const indonesianMatch = dateStr.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(19\d{2}|20\d{2})/i);
    if (indonesianMatch) {
        const day = parseInt(indonesianMatch[1], 10);
        const month = MONTH_MAP[indonesianMatch[2].toLowerCase()];
        const year = parseInt(indonesianMatch[3], 10);
        if (!isNaN(day) && month !== undefined && !isNaN(year)) {
            return new Date(year, month, day);
        }
    }

    // Try format: DD-MM-YYYY or DD/MM/YYYY
    const numericMatch = dateStr.match(/(\d{1,2})[-\/](\d{1,2})[-\/](19\d{2}|20\d{2})/);
    if (numericMatch) {
        const day = parseInt(numericMatch[1], 10);
        const month = parseInt(numericMatch[2], 10) - 1;
        const year = parseInt(numericMatch[3], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            return new Date(year, month, day);
        }
    }

    return null;
}

/**
 * Extract dates from text (tanggal terbit and tanggal berlaku)
 */
function extractDates(text: string): { tanggalTerbit: Date | null; tanggalBerlaku: Date | null } {
    const dates: Date[] = [];

    // Find all dates in text
    for (const pattern of PATTERNS.datePatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const parsed = parseIndonesianDate(match[0]);
            if (parsed) {
                dates.push(parsed);
            }
        }
    }

    if (dates.length === 0) {
        return { tanggalTerbit: null, tanggalBerlaku: null };
    }

    // Sort dates
    dates.sort((a, b) => a.getTime() - b.getTime());

    // Look for "ditetapkan" or "diundangkan" context for tanggal terbit
    const terbitMatch = text.match(/(?:ditetapkan|diundangkan)[^\d]*(\d{1,2}[-\/\s](?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|\d{1,2})[-\/\s](?:19|20)\d{2})/i);
    let tanggalTerbit: Date | null = null;
    if (terbitMatch) {
        tanggalTerbit = parseIndonesianDate(terbitMatch[1]);
    }

    // Look for "mulai berlaku" context for tanggal berlaku
    const berlakuMatch = text.match(/(?:mulai\s+berlaku)[^\d]*(\d{1,2}[-\/\s](?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|\d{1,2})[-\/\s](?:19|20)\d{2})/i);
    let tanggalBerlaku: Date | null = null;
    if (berlakuMatch) {
        tanggalBerlaku = parseIndonesianDate(berlakuMatch[1]);
    }

    // Fallback: use first date as terbit if not found
    if (!tanggalTerbit && dates.length > 0) {
        tanggalTerbit = dates[0];
    }

    return { tanggalTerbit, tanggalBerlaku };
}

/**
 * Extract status aturan from text
 */
function extractStatusAturan(text: string): RegulationStatus {
    for (const { regex, status } of PATTERNS.statusPatterns) {
        if (regex.test(text)) {
            return status;
        }
    }
    return 'unknown';
}

/**
 * Calculate confidence score based on extracted metadata completeness
 */
function calculateConfidence(metadata: Partial<ExtractedMetadata>): number {
    let score = 0;
    const weights = {
        jenis: 0.25,
        nomor: 0.25,
        tahun: 0.20,
        judul: 0.15,
        tanggalTerbit: 0.10,
        tanggalBerlaku: 0.05,
    };

    if (metadata.jenis && metadata.jenis !== 'UNKNOWN') score += weights.jenis;
    if (metadata.nomor) score += weights.nomor;
    if (metadata.tahun) score += weights.tahun;
    if (metadata.judul) score += weights.judul;
    if (metadata.tanggalTerbit) score += weights.tanggalTerbit;
    if (metadata.tanggalBerlaku) score += weights.tanggalBerlaku;

    return Math.round(score * 100) / 100;
}

/**
 * Main extraction function - applies all heuristics to extract metadata
 */
export function extractMetadataFromText(text: string): ExtractedMetadata {
    const jenis = extractJenis(text);
    const nomor = extractNomor(text);
    const tahun = extractTahun(text);
    const judul = extractJudul(text);
    const { tanggalTerbit, tanggalBerlaku } = extractDates(text);
    const statusAturan = extractStatusAturan(text);

    const metadata: ExtractedMetadata = {
        jenis,
        nomor,
        tahun,
        judul,
        tanggalTerbit,
        tanggalBerlaku,
        statusAturan,
        confidence: 0,
        extractionNotes: {
            extractedAt: new Date().toISOString(),
            textLength: text.length,
            jenisFound: jenis !== 'UNKNOWN',
            nomorFound: nomor !== null,
            tahunFound: tahun !== null,
        },
    };

    metadata.confidence = calculateConfidence(metadata);

    return metadata;
}
