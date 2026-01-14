// Local type definitions matching Prisma schema
type RegulationType = 'UU' | 'PERPU' | 'PP' | 'PMK' | 'PER' | 'SE' | 'KEP' | 'NOTA_DINAS' | 'PUTUSAN' | 'BUKU' | 'UNKNOWN';
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
    // Jenis dokumen patterns - ORDER MATTERS! More specific patterns first
    jenisPatterns: [
        // PUTUSAN - very specific, check first
        { regex: /\bPUTUSAN\b/i, type: 'PUTUSAN' as const },
        { regex: /\bPUT[-\.]\d+/i, type: 'PUTUSAN' as const },
        { regex: /\bPENGADILAN\s+PAJAK\b/i, type: 'PUTUSAN' as const },
        // NOTA DINAS - BEFORE PMK (Nota Dinas about PMK should still be classified as ND)
        { regex: /\bNOTA\s+DINAS\b/i, type: 'NOTA_DINAS' as const },
        { regex: /\bND\s*[-.]?\s*\d+\/[A-Z0-9.\/]+\/\d{4}/i, type: 'NOTA_DINAS' as const },
        { regex: /\bND\s*[-]?\s*\d+[-][A-Z]+[-]\d+[-]\d{4}/i, type: 'NOTA_DINAS' as const }, // ND14-PJ-02-2024 format
        { regex: /\bND\d+[-][A-Z]+[-]\d+[-]\d{4}/i, type: 'NOTA_DINAS' as const }, // ND14-PJ-02-2024 without space
        { regex: /\bNOMOR\s+ND\s*[-.]?\s*\d+/i, type: 'NOTA_DINAS' as const },
        // PER (Peraturan Direktur Jenderal) - BEFORE PMK (PER about PMK should be classified as PER)
        { regex: /\bPERATURAN\s+DIREKTUR\s+JENDERAL\s+PAJAK\b/i, type: 'PER' as const },
        { regex: /\bPERATURAN\s+DIREKTUR\s+JENDERAL\b/i, type: 'PER' as const },
        { regex: /\bPER[- _]?\d+[- _\/]PJ/i, type: 'PER' as const }, // PER-11/PJ, PER_11_PJ
        { regex: /\bPER\d+[_-][A-Z]+[_-]\d{4}/i, type: 'PER' as const }, // PER11_PJ_2025 format
        { regex: /\bNOMOR\s+PER[- ]?\d+/i, type: 'PER' as const },
        // SE (Surat Edaran) - BEFORE PMK
        { regex: /\bSURAT\s+EDARAN\s+DIREKTUR\s+JENDERAL\s+PAJAK\b/i, type: 'SE' as const },
        { regex: /\bSURAT\s+EDARAN\s+DIREKTUR\s+JENDERAL\b/i, type: 'SE' as const },
        { regex: /\bSURAT\s+EDARAN\b/i, type: 'SE' as const },
        { regex: /\bSE[- ]?\d+\/PJ/i, type: 'SE' as const },
        { regex: /\bNOMOR\s+SE[- ]?\d+/i, type: 'SE' as const },
        // PMK (Peraturan Menteri Keuangan) - after PER and SE
        { regex: /\bPERATURAN\s+MENTERI\s+KEUANGAN\b/i, type: 'PMK' as const },
        { regex: /\bPMK\s*(?:NOMOR|NO\.?|:)?\s*\d+/i, type: 'PMK' as const },
        { regex: /\d+\/PMK\./i, type: 'PMK' as const },
        // KEP (Keputusan) - BEFORE UU/PP
        { regex: /\bKEPUTUSAN\s+DIREKTUR\s+JENDERAL\s+PAJAK\b/i, type: 'KEP' as const },
        { regex: /\bKEPUTUSAN\s+DIREKTUR\s+JENDERAL\b/i, type: 'KEP' as const },
        { regex: /\bKEPUTUSAN\b/i, type: 'KEP' as const },
        { regex: /\bKEP[- ]?\d+/i, type: 'KEP' as const },
        // PERPU (Peraturan Pemerintah Pengganti Undang-Undang) - BEFORE PP because PERPU contains "PERATURAN PEMERINTAH"
        { regex: /\bPERATURAN\s+PEMERINTAH\s+PENGGANTI\s+UNDANG[-\s]?UNDANG\b/i, type: 'PERPU' as const },
        { regex: /\bPERPU\s+NOMOR\s+\d+\s+TAHUN\b/i, type: 'PERPU' as const },
        { regex: /\bPERPU\s*(?:NOMOR|NO\.?|:)?\s*\d+/i, type: 'PERPU' as const },
        // PP (Peraturan Pemerintah) - AFTER PERPU!
        { regex: /\bPERATURAN\s+PEMERINTAH\s+REPUBLIK\s+INDONESIA\b/i, type: 'PP' as const },
        { regex: /\bPERATURAN\s+PEMERINTAH\b/i, type: 'PP' as const },
        { regex: /\bPP\s+NOMOR\s+\d+\s+TAHUN\b/i, type: 'PP' as const },
        { regex: /\bPP\s*(?:NOMOR|NO\.?|:)\s*\d+/i, type: 'PP' as const },
        // UU (Undang-Undang)
        { regex: /\bUNDANG[- ]?UNDANG\s+REPUBLIK\s+INDONESIA\b/i, type: 'UU' as const },
        { regex: /\bUNDANG[- ]?UNDANG\b/i, type: 'UU' as const },
        { regex: /\bUU\s*(?:NOMOR|NO\.?|:)\s*\d+/i, type: 'UU' as const },
        // Menimbang+Mengingat as PMK fallback (only if no other match)
        { regex: /\bMenimbang\s*:[\s\S]{0,500}Mengingat\s*:/i, type: 'PMK' as const },
        // BUKU detection - AFTER regulations
        { regex: /\bBAB\s+[IVX]+\b[\s\S]{0,5000}\bBAB\s+[IVX]+\b/i, type: 'BUKU' as const },
        { regex: /\bBAB\s+\d+\b[\s\S]{0,5000}\bBAB\s+\d+\b/i, type: 'BUKU' as const },
        { regex: /\bCHAPTER\s+\d+\b[\s\S]{0,5000}\bCHAPTER\s+\d+\b/i, type: 'BUKU' as const },
        { regex: /\bDAFTAR\s+ISI\b[\s\S]{0,2000}(?:BAB|CHAPTER|\d+\.\s+[A-Z])/i, type: 'BUKU' as const },
        { regex: /\bKATA\s+PENGANTAR\b[\s\S]{0,3000}\bDAFTAR\s+ISI\b/i, type: 'BUKU' as const },
        { regex: /\bPenerbit\b[\s\S]{0,500}\bISBN\b/i, type: 'BUKU' as const },
        { regex: /\bISBN\b\s*:?\s*[\d\-]+/i, type: 'BUKU' as const },
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
 * Filename patterns for document type detection (higher priority than content)
 * Patterns use (?:^|[_\-]) instead of \b to handle UUID prefix like "abc123_PER_11..."
 */
const FILENAME_PATTERNS: Array<{ regex: RegExp; type: RegulationType }> = [
    // PER patterns in filename - handles multiple formats (with space, hyphen, or underscore)
    { regex: /^PER[-_\s]?\d+[-_\s\/]?PJ/i, type: 'PER' },  // Starts with PER (no prefix)
    { regex: /(?:^|[_\-\s])PER[-_\s]?\d+[-_\s\/]?PJ/i, type: 'PER' },
    { regex: /(?:^|[_\-])PER\d+[-_][A-Z]+[-_]\d{4}/i, type: 'PER' }, // PER11_PJ_2025
    { regex: /PER[-_]\d+[-_]PJ[-_]\d{4}/i, type: 'PER' }, // PER_11_PJ_2025
    // ND patterns in filename  
    { regex: /(?:^|[_\-\s])ND[-_\s]?\d+[-_\s\/]?PJ/i, type: 'NOTA_DINAS' },
    { regex: /(?:^|[_\-])ND\d+[-_][A-Z]+[-_]\d+[-_]\d{4}/i, type: 'NOTA_DINAS' }, // ND14-PJ-02-2024
    { regex: /ND[-_]\d+[-_]PJ/i, type: 'NOTA_DINAS' }, // ND_14_PJ format
    // SE patterns in filename
    { regex: /(?:^|[_\-\s])SE[-_\s]?\d+[-_\s\/]?PJ/i, type: 'SE' },
    { regex: /SE[-_]\d+[-_]PJ/i, type: 'SE' }, // SE_1_PJ format
    // PP patterns in filename - BEFORE PMK to prioritize PP detection
    { regex: /^PP\s+Nomor\s+\d+/i, type: 'PP' },  // "PP Nomor 73 Tahun 2016"
    { regex: /^PP\s+No\.?\s*\d+/i, type: 'PP' },   // "PP No 68" or "PP No. 68"
    { regex: /^PP[-_\s]?\d+/i, type: 'PP' },       // Starts with PP (PP_36, PP 36, PP36)
    { regex: /(?:^|[_\-\s])PP[-_\s]?\d+[-_\s]?\d{4}/i, type: 'PP' },
    { regex: /PP\s+\d+\s+Tahun/i, type: 'PP' }, // "PP 36 Tahun 2008"
    // PERPU patterns in filename - MUST BE BEFORE PMK
    { regex: /^Perpu\s+Nomor\s+\d+/i, type: 'PERPU' },  // "Perpu Nomor 2 Tahun 2022"
    { regex: /^PERPU[-_\s]?Nomor/i, type: 'PERPU' },    // "PERPU Nomor" or "PERPU-Nomor"
    { regex: /^PERPU[-_\s]?\d+/i, type: 'PERPU' },       // Starts with PERPU
    { regex: /(?:^|[_\-\s])PERPU[-_\s]?\d+[-_\s]?\d{4}/i, type: 'PERPU' },
    { regex: /PERPU\s+\d+\s+Tahun/i, type: 'PERPU' }, // "PERPU 1 Tahun 2020"
    // PMK patterns in filename - with space, hyphen, underscore, or "Tahun"
    { regex: /^PMK[-_\s]?\d+/i, type: 'PMK' },  // Starts with PMK
    { regex: /(?:^|[_\-\s])PMK[-_\s]?\d+/i, type: 'PMK' },
    { regex: /PMK\s+\d+\s+Tahun/i, type: 'PMK' }, // "PMK 168 Tahun 2023"
    // PUTUSAN patterns in filename - very specific
    { regex: /(?:^|[_\-])PUT[-_.]?\d+/i, type: 'PUTUSAN' },
    { regex: /PUTUSAN[-_]\d+/i, type: 'PUTUSAN' },
];

/**
 * Extract jenis dokumen from text and optional filename
 * Filename detection has higher priority than content detection
 */
function extractJenis(text: string, filename?: string): RegulationType {
    // Check filename patterns first (higher priority)
    if (filename) {
        console.log(`[Heuristics] Checking filename for type detection: "${filename}"`);
        for (const { regex, type } of FILENAME_PATTERNS) {
            if (regex.test(filename)) {
                console.log(`[Heuristics] Detected ${type} from filename pattern: ${regex}`);
                return type;
            }
        }
        console.log(`[Heuristics] No filename pattern matched, falling back to content detection`);
    } else {
        console.log(`[Heuristics] No filename provided, using content detection only`);
    }

    // Fallback to content patterns
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
 * @param text - Document content text
 * @param filename - Optional filename for improved type detection
 */
export function extractMetadataFromText(text: string, filename?: string): ExtractedMetadata {
    const jenis = extractJenis(text, filename);
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
