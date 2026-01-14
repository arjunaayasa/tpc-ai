/**
 * PER Salindia Extractor - Parse PER presentation/slide materials
 * Handles: Heading-based chunking (Overview, Latar Belakang, etc.)
 */

import {
    SALINDIA_HEADING_REGEX,
    ALLCAPS_HEADING_REGEX,
    PAGE_NUMBER_REGEX,
    PAGE_HEADER_REGEX,
    LEGAL_REF_REGEX,
    PER_NOMOR_REGEX,
    TENTANG_REGEX,
} from './perRegex';
import { PerIdentity, PerSection, PerChunk, PerParseResult, PerChunkType } from './perTypes';

// ============== TEXT CLEANING ==============

function cleanSalindiaText(rawText: string): string {
    let text = rawText;

    // Normalize whitespace
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');
    text = text.replace(/[ \t]+/g, ' ');

    // Remove isolated page numbers
    text = text.replace(PAGE_NUMBER_REGEX, '');

    // Remove repeated headers/footers
    text = text.replace(PAGE_HEADER_REGEX, '');

    // Remove multiple consecutive newlines (more than 3)
    text = text.replace(/\n{4,}/g, '\n\n\n');

    // Trim lines
    text = text.split('\n').map(line => line.trimEnd()).join('\n');

    return text.trim();
}

// ============== IDENTITY EXTRACTION ==============

function extractSalindiaIdentity(text: string): PerIdentity {
    let nomor: string | null = null;
    let tahun: number | null = null;
    let tentang: string | null = null;

    // Extract PER nomor
    const nomorMatch = text.match(PER_NOMOR_REGEX);
    if (nomorMatch) {
        const perNum = nomorMatch[1];
        const perYear = nomorMatch[2];
        nomor = `PER-${perNum}/PJ/${perYear}`;
        tahun = parseInt(perYear, 10);
    }

    // Try to find year in first 1000 chars if not found
    if (!tahun) {
        const header = text.substring(0, 1000);
        const yearMatch = header.match(/\b(20[0-2]\d)\b/);
        if (yearMatch) {
            tahun = parseInt(yearMatch[1], 10);
        }
    }

    // Extract TENTANG
    const tentangMatch = text.match(TENTANG_REGEX);
    if (tentangMatch) {
        tentang = tentangMatch[1].trim()
            .replace(/\s+/g, ' ')
            .substring(0, 300);
    }

    return {
        nomor,
        tahun,
        tentang,
        tanggalTerbit: null,
        tanggalBerlaku: null,
    };
}

// ============== UTILITIES ==============

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function extractLegalRefs(text: string): string[] {
    const refs: string[] = [];
    const regex = new RegExp(LEGAL_REF_REGEX.source, 'gi');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const ref = match[0].trim();
        if (!refs.includes(ref)) {
            refs.push(ref);
        }
    }

    return refs;
}

function generateAnchorCitation(identity: PerIdentity, title: string): string {
    const base = identity.nomor ? `PER ${identity.nomor}` : 'PER';
    return `${base} - ${title}`;
}

// ============== HEADING DETECTION ==============

interface HeadingMatch {
    index: number;
    text: string;
    type: 'slide' | 'allcaps';
}

/**
 * Find all headings in the text
 */
function findHeadings(text: string): HeadingMatch[] {
    const headings: HeadingMatch[] = [];
    const seenIndices = new Set<number>();

    // Find known slide headings (Overview, Latar Belakang, etc.)
    const slideRegex = new RegExp(SALINDIA_HEADING_REGEX.source, 'gim');
    let match: RegExpExecArray | null;

    while ((match = slideRegex.exec(text)) !== null) {
        if (!seenIndices.has(match.index)) {
            seenIndices.add(match.index);
            headings.push({
                index: match.index,
                text: match[0].trim(),
                type: 'slide',
            });
        }
    }

    // Find all-caps lines as potential headings
    const allCapsRegex = new RegExp(ALLCAPS_HEADING_REGEX.source, 'gm');

    while ((match = allCapsRegex.exec(text)) !== null) {
        const line = match[0].trim();

        // Skip if already captured or too short/long
        if (seenIndices.has(match.index)) continue;
        if (line.length < 5 || line.length > 80) continue;

        // Skip common regulation headers
        if (line.includes('PERATURAN') ||
            line.includes('DIREKTUR') ||
            line.includes('MENTERI') ||
            line.includes('LAMPIRAN') ||
            line.includes('REPUBLIK INDONESIA')) {
            continue;
        }

        seenIndices.add(match.index);
        headings.push({
            index: match.index,
            text: line,
            type: 'allcaps',
        });
    }

    // Sort by index
    headings.sort((a, b) => a.index - b.index);

    return headings;
}

// ============== MAIN PARSER ==============

/**
 * Parse a PER SALINDIA document into heading-based chunks
 */
export function parsePERSalindia(rawText: string): PerParseResult {
    // 1. Clean text
    const cleanedText = cleanSalindiaText(rawText);

    // 2. Extract identity
    const identity = extractSalindiaIdentity(cleanedText);
    console.log(`[PER Salindia] Extracted identity: ${JSON.stringify(identity)}`);

    // 3. Find headings
    const headings = findHeadings(cleanedText);
    console.log(`[PER Salindia] Found ${headings.length} headings`);

    // 4. Build sections and chunks
    const sections: PerSection[] = [];
    const chunks: PerChunk[] = [];
    let orderIndex = 0;

    if (headings.length === 0) {
        // No headings found - create single chunk
        chunks.push({
            chunkType: 'HEADING_SECTION',
            title: 'Content',
            anchorCitation: generateAnchorCitation(identity, 'Content'),
            text: cleanedText,
            orderIndex: orderIndex++,
            legalRefs: extractLegalRefs(cleanedText),
            tokenEstimate: estimateTokens(cleanedText),
        });

        sections.push({
            type: 'HEADING_SECTION',
            title: 'Content',
            startOffset: 0,
            endOffset: cleanedText.length,
            text: cleanedText,
        });
    } else {
        // Create preamble if first heading is not at start
        if (headings[0].index > 100) {
            const preambleText = cleanedText.substring(0, headings[0].index).trim();
            if (preambleText.length > 50) {
                chunks.push({
                    chunkType: 'PREAMBLE',
                    title: 'Header',
                    anchorCitation: generateAnchorCitation(identity, 'Header'),
                    text: preambleText,
                    orderIndex: orderIndex++,
                    legalRefs: extractLegalRefs(preambleText),
                    tokenEstimate: estimateTokens(preambleText),
                });

                sections.push({
                    type: 'PREAMBLE',
                    title: 'Header',
                    startOffset: 0,
                    endOffset: headings[0].index,
                    text: preambleText,
                });
            }
        }

        // Create chunk for each heading section
        for (let i = 0; i < headings.length; i++) {
            const current = headings[i];
            const next = headings[i + 1];
            const endIndex = next ? next.index : cleanedText.length;
            const sectionText = cleanedText.substring(current.index, endIndex).trim();

            if (sectionText.length > 30) {
                const normalizedTitle = current.text.substring(0, 80);

                chunks.push({
                    chunkType: 'HEADING_SECTION',
                    title: normalizedTitle,
                    anchorCitation: generateAnchorCitation(identity, normalizedTitle),
                    text: sectionText,
                    orderIndex: orderIndex++,
                    legalRefs: extractLegalRefs(sectionText),
                    tokenEstimate: estimateTokens(sectionText),
                });

                sections.push({
                    type: 'HEADING_SECTION',
                    title: normalizedTitle,
                    startOffset: current.index,
                    endOffset: endIndex,
                    text: sectionText,
                });
            }
        }
    }

    // 5. Collect all legal refs
    const allLegalRefs: string[] = [];
    for (const chunk of chunks) {
        if (chunk.legalRefs) {
            for (const ref of chunk.legalRefs) {
                if (!allLegalRefs.includes(ref)) {
                    allLegalRefs.push(ref);
                }
            }
        }
    }

    console.log(`[PER Salindia] Parsed ${sections.length} sections, ${chunks.length} chunks`);

    return {
        subtype: 'PER_SALINDIA',
        identity,
        sections,
        chunks,
        legalRefs: allLegalRefs,
    };
}
