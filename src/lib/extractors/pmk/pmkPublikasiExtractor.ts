/**
 * PMK Publikasi Extractor - Parse socialization/infographic PMK materials
 * Handles heading-based sections like LATAR BELAKANG, TUJUAN, SUBSTANSI, etc.
 */

import {
    PAGE_NUMBER_REGEX,
    PAGE_HEADER_REGEX,
    HEADING_GLOBAL_REGEX,
    ALLCAPS_HEADING_REGEX,
} from './pmkRegex';
import { PmkIdentity, PmkSection, PmkChunk, PmkParseResult } from './pmkTypes';

// ============== TEXT CLEANING ==============

/**
 * Clean raw text
 */
export function cleanPublikasiText(rawText: string): string {
    let text = rawText;

    // Normalize whitespace
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');

    // Remove isolated page numbers
    text = text.replace(PAGE_NUMBER_REGEX, '');

    // Remove page headers/footers
    text = text.replace(PAGE_HEADER_REGEX, '');

    // Remove multiple newlines
    text = text.replace(/\n{3,}/g, '\n\n');

    // Trim lines
    text = text.split('\n').map(line => line.trimEnd()).join('\n');

    return text.trim();
}

// ============== IDENTITY EXTRACTION ==============

/**
 * Extract basic identity from publikasi (less structured)
 */
function extractPublikasiIdentity(text: string): PmkIdentity {
    let nomor: string | null = null;
    let tahun: number | null = null;
    let tentang: string | null = null;

    // Try to find PMK number reference
    const nomorMatch = text.match(/PMK(?:\s+(?:Nomor|No\.?))?\s*(\d+(?:\/PMK\.[\d]+\/\d{4})?)/i);
    if (nomorMatch) {
        nomor = nomorMatch[1].trim();
        const yearMatch = nomor.match(/\/(\d{4})$/);
        if (yearMatch) {
            tahun = parseInt(yearMatch[1], 10);
        }
    }

    // If no nomor, try to find just a year
    if (!tahun) {
        const yearMatches = text.match(/\b(20[12]\d)\b/g);
        if (yearMatches && yearMatches.length > 0) {
            // Use the most common year in the document
            const yearCounts: Record<string, number> = {};
            for (const y of yearMatches) {
                yearCounts[y] = (yearCounts[y] || 0) + 1;
            }
            const mostCommon = Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0];
            if (mostCommon) {
                tahun = parseInt(mostCommon[0], 10);
            }
        }
    }

    // Try to extract title/subject
    const tentangMatch = text.match(/(?:TENTANG|Tentang|tentang)\s+(.+?)(?=\n|$)/);
    if (tentangMatch) {
        tentang = tentangMatch[1].trim().substring(0, 200);
    } else {
        // Use first significant heading as title
        const firstHeadingMatch = text.match(HEADING_GLOBAL_REGEX);
        if (firstHeadingMatch) {
            tentang = `Sosialisasi ${firstHeadingMatch[0]}`;
        }
    }

    return { nomor, tahun, tentang, tanggalTerbit: null, tanggalBerlaku: null };
}

// ============== TOKEN ESTIMATION ==============

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

// ============== HEADING DETECTION ==============

interface HeadingMatch {
    title: string;
    startIndex: number;
    isAllCaps: boolean;
}

/**
 * Find all headings in the text
 */
function findHeadings(text: string): HeadingMatch[] {
    const headings: HeadingMatch[] = [];
    const seenIndices = new Set<number>();

    // Find known heading patterns first
    const knownRegex = new RegExp(HEADING_GLOBAL_REGEX.source, 'gim');
    let match: RegExpExecArray | null;

    while ((match = knownRegex.exec(text)) !== null) {
        if (!seenIndices.has(match.index)) {
            headings.push({
                title: match[1].trim(),
                startIndex: match.index,
                isAllCaps: true,
            });
            seenIndices.add(match.index);
        }
    }

    // Find all-caps lines that could be headings
    const lines = text.split('\n');
    let currentIndex = 0;

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Check if it's an all-caps heading (3-80 chars, not already found)
        if (
            trimmedLine.length >= 3 &&
            trimmedLine.length <= 80 &&
            /^[A-Z][A-Z\s\-\.]{2,}$/.test(trimmedLine) &&
            !seenIndices.has(currentIndex)
        ) {
            // Avoid common false positives
            const skipPatterns = [
                /^SALINAN$/,
                /^PERATURAN/,
                /^MENTERI/,
                /^KEUANGAN/,
                /^REPUBLIK/,
                /^INDONESIA$/,
                /^TENTANG$/,
                /^DENGAN$/,
                /^HALAMAN/,
                /^BAB\s/,
                /^PASAL/,
            ];

            const shouldSkip = skipPatterns.some(p => p.test(trimmedLine));

            if (!shouldSkip) {
                headings.push({
                    title: trimmedLine,
                    startIndex: currentIndex,
                    isAllCaps: true,
                });
                seenIndices.add(currentIndex);
            }
        }

        currentIndex += line.length + 1; // +1 for newline
    }

    // Sort by index
    headings.sort((a, b) => a.startIndex - b.startIndex);

    return headings;
}

// ============== MAIN PARSER ==============

/**
 * Parse a PMK PUBLIKASI document into heading-based sections
 */
export function parsePMKPublikasi(rawText: string): PmkParseResult {
    // 1. Clean text
    const cleanedText = cleanPublikasiText(rawText);

    // 2. Extract identity
    const identity = extractPublikasiIdentity(cleanedText);
    console.log(`[PMK Publikasi] Extracted identity: ${JSON.stringify(identity)}`);

    // 3. Find heading boundaries
    const headings = findHeadings(cleanedText);
    console.log(`[PMK Publikasi] Found ${headings.length} headings`);

    // 4. Build sections
    const sections: PmkSection[] = [];

    // If no headings found, treat entire document as one section
    if (headings.length === 0) {
        sections.push({
            type: 'HEADING_SECTION',
            title: 'Konten',
            startOffset: 0,
            endOffset: cleanedText.length,
            text: cleanedText,
        });
    } else {
        // Add preamble if first heading doesn't start at 0
        if (headings[0].startIndex > 100) {
            sections.push({
                type: 'PREAMBLE',
                title: 'Header',
                startOffset: 0,
                endOffset: headings[0].startIndex,
                text: cleanedText.substring(0, headings[0].startIndex).trim(),
            });
        }

        // Add heading sections
        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const nextHeading = headings[i + 1];
            const endIndex = nextHeading ? nextHeading.startIndex : cleanedText.length;
            const sectionText = cleanedText.substring(heading.startIndex, endIndex).trim();

            sections.push({
                type: 'HEADING_SECTION',
                title: heading.title,
                startOffset: heading.startIndex,
                endOffset: endIndex,
                text: sectionText,
            });
        }
    }

    // 5. Build chunks from sections
    const chunks: PmkChunk[] = [];
    let orderIndex = 0;

    const base = identity.nomor
        ? `PMK ${identity.nomor} Publikasi`
        : 'PMK Publikasi';

    for (const section of sections) {
        chunks.push({
            chunkType: section.type === 'PREAMBLE' ? 'PREAMBLE' : 'HEADING_SECTION',
            title: section.title,
            anchorCitation: `${base} - ${section.title}`,
            text: section.text,
            orderIndex: orderIndex++,
            legalRefs: [],
            tokenEstimate: estimateTokens(section.text),
        });
    }

    console.log(`[PMK Publikasi] Parsed ${sections.length} sections, ${chunks.length} chunks`);

    return {
        subtype: 'PMK_PUBLIKASI',
        identity,
        sections,
        chunks,
        legalRefs: [],
    };
}
