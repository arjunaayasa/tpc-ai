/**
 * Chunking utility for splitting Indonesian tax regulation documents by Pasal
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
 * Parse fullText into chunks by Pasal sections
 */
export function chunkByPasal(fullText: string, meta?: DocumentMeta): ChunkData[] {
    const chunks: ChunkData[] = [];

    // Regex to find "Pasal <number>" with optional whitespace variations
    const pasalRegex = /\bPasal\s+(\d+)\b/gi;

    // Find all Pasal positions
    const matches: { index: number; pasal: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = pasalRegex.exec(fullText)) !== null) {
        matches.push({
            index: match.index,
            pasal: match[1],
        });
    }

    if (matches.length === 0) {
        // No Pasal found - create single chunk with full text
        const text = fullText.trim();
        if (text.length > 0) {
            chunks.push({
                pasal: null,
                ayat: null,
                huruf: null,
                orderIndex: 0,
                anchorCitation: generateCitation(meta, null),
                text,
                tokenEstimate: estimateTokens(text),
            });
        }
        return chunks;
    }

    // Handle text before first Pasal (preamble)
    if (matches[0].index > 0) {
        const preamble = fullText.substring(0, matches[0].index).trim();
        if (preamble.length > 50) { // Only include if substantial
            chunks.push({
                pasal: null,
                ayat: null,
                huruf: null,
                orderIndex: 0,
                anchorCitation: generateCitation(meta, null, 'Pembukaan'),
                text: preamble,
                tokenEstimate: estimateTokens(preamble),
            });
        }
    }

    // Extract each Pasal section
    for (let i = 0; i < matches.length; i++) {
        const currentMatch = matches[i];
        const nextMatch = matches[i + 1];

        const startIndex = currentMatch.index;
        const endIndex = nextMatch ? nextMatch.index : fullText.length;

        const sectionText = fullText.substring(startIndex, endIndex).trim();

        if (sectionText.length > 0) {
            chunks.push({
                pasal: currentMatch.pasal,
                ayat: null, // Could be enhanced to parse ayat within pasal
                huruf: null,
                orderIndex: chunks.length,
                anchorCitation: generateCitation(meta, currentMatch.pasal),
                text: sectionText,
                tokenEstimate: estimateTokens(sectionText),
            });
        }
    }

    return chunks;
}

/**
 * Generate anchor citation string
 */
function generateCitation(meta?: DocumentMeta, pasal?: string | null, section?: string): string {
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
        parts.push(`Pasal ${pasal}`);
    }

    if (parts.length === 0) {
        return pasal ? `Pasal ${pasal}` : 'Document';
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
