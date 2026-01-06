/**
 * Chunking utility for splitting Indonesian tax regulation documents by Pasal and Ayat
 */

export interface ChunkData {
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    orderIndex: number;
    anchorCitation: string;
    text: string;
    tokenEstimate: number;
}

export interface DocumentMeta {
    jenis?: string;
    nomor?: string | null;
    tahun?: number | null;
}

/**
 * Parse ayat sections within a Pasal text
 * Returns array of ayat chunks, or single chunk if no ayat found
 */
function parseAyatInPasal(
    pasalText: string,
    pasalNum: string,
    meta?: DocumentMeta
): { ayat: string | null; text: string }[] {
    const ayatChunks: { ayat: string | null; text: string }[] = [];

    // Regex to find "(1)", "(2)", "(4a)", etc. at START of line only
    // This avoids matching references like "dimaksud pada ayat (1)" 
    // Pattern: newline, optional whitespace, then (number) or (numberLetter)
    const ayatRegex = /(?:^|\n)\s*\((\d+[a-z]?)\)\s+(?=[A-Z])/g;

    // Find all Ayat positions
    const ayatMatches: { index: number; ayat: string; matchLength: number }[] = [];
    const seenAyats = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = ayatRegex.exec(pasalText)) !== null) {
        const ayatNum = match[1];
        // Only take first occurrence of each ayat number
        if (!seenAyats.has(ayatNum)) {
            seenAyats.add(ayatNum);
            ayatMatches.push({
                index: match.index,
                ayat: ayatNum,
                matchLength: match[0].length,
            });
        }
    }

    // If no ayat found or only 1, return the whole pasal as single chunk
    if (ayatMatches.length <= 1) {
        return [{ ayat: null, text: pasalText }];
    }

    // Check if first ayat is (1) - basic validation
    const firstAyat = ayatMatches[0].ayat;
    if (firstAyat !== '1') {
        // Doesn't start with (1), might not be real ayat structure
        return [{ ayat: null, text: pasalText }];
    }

    // Handle text before first Ayat (Pasal header)
    const headerText = pasalText.substring(0, ayatMatches[0].index).trim();
    
    // Extract each Ayat section
    for (let i = 0; i < ayatMatches.length; i++) {
        const currentAyat = ayatMatches[i];
        const nextAyat = ayatMatches[i + 1];

        const startIndex = currentAyat.index;
        const endIndex = nextAyat ? nextAyat.index : pasalText.length;

        let ayatText = pasalText.substring(startIndex, endIndex).trim();

        // For first ayat, prepend the header (Pasal X title)
        if (i === 0 && headerText.length > 0) {
            ayatText = headerText + '\n' + ayatText;
        }

        if (ayatText.length > 0) {
            ayatChunks.push({
                ayat: currentAyat.ayat,
                text: ayatText,
            });
        }
    }

    return ayatChunks;
}

/**
 * Parse fullText into chunks by Pasal sections, then by Ayat within each Pasal
 */
export function chunkByPasal(fullText: string, meta?: DocumentMeta): ChunkData[] {
    const chunks: ChunkData[] = [];

    // Normalize text: fix common PDF extraction issues
    const normalizedText = fullText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Fix "P a s a l" with spaces between letters
        .replace(/P\s*a\s*s\s*a\s*l/gi, 'Pasal')
        // Fix multiple spaces
        .replace(/[ \t]+/g, ' ');

    // Regex to find "Pasal <number>" that is a HEADER, not a reference
    // Header Pasal characteristics:
    // 1. At start of line (after newline)
    // 2. NOT preceded by words like "dalam", "pada", "sebagaimana", "dimaksud", etc.
    // 3. The line should be relatively short (just "Pasal X" or "Pasal X\n")
    // We use negative lookbehind to exclude references
    
    // First pass: find all potential Pasal positions
    // Support: Pasal 1, Pasal 13A, Pasal 14B, etc.
    const potentialPasalRegex = /\n\s*Pasal\s+(\d+[A-Z]?)\b/gi;

    // Find all Pasal positions - validate each one
    const matches: { index: number; pasal: string; fullMatch: string }[] = [];
    const seenPasals = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = potentialPasalRegex.exec(normalizedText)) !== null) {
        const pasalNum = match[1].toUpperCase(); // Normalize: 13a -> 13A
        const matchIndex = match.index;
        
        // Check context before the match to see if it's a reference
        // Look at the 50 characters before this match
        const contextStart = Math.max(0, matchIndex - 50);
        const contextBefore = normalizedText.substring(contextStart, matchIndex).toLowerCase();
        
        // Words that indicate this is a reference, not a header
        const referenceIndicators = [
            'dalam pasal',
            'pada pasal', 
            'sebagaimana dimaksud',
            'dimaksud dalam',
            'dimaksud pada',
            'menurut pasal',
            'berdasarkan pasal',
            'sesuai pasal',
            'ketentuan pasal',
            'atau pasal',
            'dan pasal',
            'sampai dengan pasal',
            'huruf'  // like "huruf a Pasal 28"
        ];
        
        const isReference = referenceIndicators.some(indicator => 
            contextBefore.includes(indicator)
        );
        
        // Also check: a header Pasal should be followed by newline or ayat (1)
        // Look at what follows
        const afterMatch = normalizedText.substring(match.index + match[0].length, match.index + match[0].length + 30);
        const looksLikeHeader = /^\s*(\n|\(1\)|$)/i.test(afterMatch);
        
        if (!isReference || looksLikeHeader) {
            if (!seenPasals.has(pasalNum)) {
                seenPasals.add(pasalNum);
                matches.push({
                    index: matchIndex,
                    pasal: pasalNum,
                    fullMatch: match[0],
                });
            }
        }
    }

    if (matches.length === 0) {
        // No Pasal found - create single chunk with full text
        const text = normalizedText.trim();
        if (text.length > 0) {
            chunks.push({
                pasal: null,
                ayat: null,
                huruf: null,
                orderIndex: 0,
                anchorCitation: generateCitation(meta, null, null),
                text,
                tokenEstimate: estimateTokens(text),
            });
        }
        return chunks;
    }

    // Sort matches by position in text (index)
    matches.sort((a, b) => a.index - b.index);

    // Handle text before first Pasal (preamble)
    if (matches[0].index > 0) {
        const preamble = normalizedText.substring(0, matches[0].index).trim();
        if (preamble.length > 50) {
            chunks.push({
                pasal: null,
                ayat: null,
                huruf: null,
                orderIndex: 0,
                anchorCitation: generateCitation(meta, null, null, 'Pembukaan'),
                text: preamble,
                tokenEstimate: estimateTokens(preamble),
            });
        }
    }

    // Extract each Pasal section, then split by Ayat
    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const nextMatch = matches[i + 1];

        const startIndex = currentMatch.index;
        const endIndex = nextMatch ? nextMatch.index : normalizedText.length;

        const pasalText = normalizedText.substring(startIndex, endIndex).trim();

        if (pasalText.length > 0) {
            // Parse ayat within this pasal
            const ayatChunks = parseAyatInPasal(pasalText, currentMatch.pasal, meta);

            for (const ayatChunk of ayatChunks) {
                chunks.push({
                    pasal: currentMatch.pasal,
                    ayat: ayatChunk.ayat,
                    huruf: null,
                    orderIndex: chunks.length,
                    anchorCitation: generateCitation(meta, currentMatch.pasal, ayatChunk.ayat),
                    text: ayatChunk.text,
                    tokenEstimate: estimateTokens(ayatChunk.text),
                });
            }
        }
    }

    return chunks;
}

/**
 * Generate anchor citation string
 */
function generateCitation(
    meta?: DocumentMeta,
    pasal?: string | null,
    ayat?: string | null,
    section?: string
): string {
    const parts: string[] = [];

    if (meta?.jenis && meta.jenis !== 'UNKNOWN') {
        parts.push(meta.jenis);
    }

    if (meta?.nomor) {
        parts.push(meta.nomor);
    } else if (meta?.tahun) {
        parts.push(`Tahun ${meta.tahun}`);
    }

    if (section) {
        parts.push(section);
    } else if (pasal) {
        let citation = `Pasal ${pasal}`;
        if (ayat) {
            citation += ` ayat (${ayat})`;
        }
        parts.push(citation);
    }

    if (parts.length === 0) {
        if (pasal) {
            let citation = `Pasal ${pasal}`;
            if (ayat) {
                citation += ` ayat (${ayat})`;
            }
            return citation;
        }
        return 'Document';
    }

    return parts.join(' ');
}

/**
 * Estimate token count (rough calculation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Generate text hash for deduplication
 */
export function hashText(text: string): string {
    // Simple hash for now - could use crypto.createHash in Node
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}
