/**
 * SE Extractor - Parse SE (Surat Edaran) documents
 * Handles: Header, Pembuka, Isi Pokok (numbered items), Penutup
 */

import {
    SE_HEADER_REGEX,
    SE_NOMOR_REGEX,
    TENTANG_REGEX,
    SEHUBUNGAN_REGEX,
    SESUAI_REGEX,
    BERSAMA_INI_REGEX,
    DENGAN_INI_REGEX,
    NUMBERED_ITEM_GLOBAL_REGEX,
    LETTERED_SUBITEM_GLOBAL_REGEX,
    DENGAN_PENEGASAN_REGEX,
    DEMIKIAN_REGEX,
    DITETAPKAN_REGEX,
    PAGE_NUMBER_REGEX,
    PAGE_HEADER_REGEX,
    LEGAL_REF_REGEX,
} from './seRegex';
import { SeIdentity, SeSection, SeChunk, SeParseResult, SeChunkType } from './seTypes';

// ============== TEXT CLEANING ==============

/**
 * Clean raw text
 */
export function cleanSEText(rawText: string): string {
    let text = rawText;

    // Normalize whitespace
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');
    text = text.replace(/[ \t]+/g, ' ');

    // Remove isolated page numbers
    text = text.replace(PAGE_NUMBER_REGEX, '');

    // Remove repeated headers/footers
    text = text.replace(PAGE_HEADER_REGEX, '');

    // Remove multiple consecutive newlines (more than 2)
    text = text.replace(/\n{3,}/g, '\n\n');

    // Trim lines
    text = text.split('\n').map(line => line.trimEnd()).join('\n');

    return text.trim();
}

// ============== IDENTITY EXTRACTION ==============

/**
 * Extract SE identity (nomor, tahun, tentang)
 */
export function extractSEIdentity(text: string): SeIdentity {
    let nomor: string | null = null;
    let tahun: number | null = null;
    let tentang: string | null = null;

    // Extract nomor
    const nomorMatch = text.match(SE_NOMOR_REGEX);
    if (nomorMatch) {
        const seNum = nomorMatch[1];
        const seCode = nomorMatch[2];
        const seYear = nomorMatch[3];
        nomor = `SE-${seNum}/${seCode}/${seYear}`;
        tahun = parseInt(seYear, 10);
    }

    // If year not found, try to extract from text
    if (!tahun) {
        const header = text.substring(0, 2000);
        const yearMatch = header.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
            tahun = parseInt(yearMatch[1], 10);
        }
    }

    // Extract TENTANG
    const tentangMatch = text.match(TENTANG_REGEX);
    if (tentangMatch) {
        tentang = tentangMatch[1].trim()
            .replace(/\s+/g, ' ')
            .substring(0, 500);
    }

    return { nomor, tahun, tentang };
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

// ============== ANCHOR CITATION ==============

function generateAnchorCitation(
    identity: SeIdentity,
    type: 'HEADER' | 'PEMBUKA' | 'ITEM' | 'SUBITEM' | 'PENUTUP',
    options?: { itemNumber?: string; subItemLetter?: string }
): string {
    const base = identity.nomor ? `SE ${identity.nomor}` : 'SE';

    switch (type) {
        case 'HEADER':
            return `${base} - Header`;
        case 'PEMBUKA':
            return `${base} - Pembuka`;
        case 'ITEM':
            return `${base} - Poin ${options?.itemNumber || ''}`;
        case 'SUBITEM':
            return `${base} - Poin ${options?.itemNumber || ''} Huruf ${options?.subItemLetter || ''}`;
        case 'PENUTUP':
            return `${base} - Penutup`;
        default:
            return base;
    }
}

// ============== BOUNDARY DETECTION ==============

/**
 * Find pembuka start index
 */
function findPembukaStart(text: string): number {
    const patterns = [
        SEHUBUNGAN_REGEX,
        SESUAI_REGEX,
        BERSAMA_INI_REGEX,
        DENGAN_INI_REGEX,
    ];

    let earliest = text.length;
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match.index !== undefined && match.index < earliest) {
            earliest = match.index;
        }
    }

    return earliest < text.length ? earliest : -1;
}

/**
 * Find first numbered item (handles leading whitespace)
 */
function findFirstNumberedItem(text: string): number {
    // Try various numbered patterns
    const patterns = [
        /^\s*1\.\s+/m,           // "1. " with optional leading whitespace
        /\n\s*1\.\s+/,           // "\n1. "
        /^\s*I\.\s+[A-Z]/m,      // Roman "I. TITLE"
        /\n\s*I\.\s+[A-Z]/,      // Roman after newline
        /^\s*\(1\)\s+/m,         // "(1) "
    ];

    let earliest = text.length;
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match.index !== undefined && match.index < earliest) {
            earliest = match.index;
        }
    }

    return earliest < text.length ? earliest : -1;
}

/**
 * Find penutup start index
 */
function findPenutupStart(text: string): number {
    const patterns = [
        DENGAN_PENEGASAN_REGEX,
        DEMIKIAN_REGEX,
        DITETAPKAN_REGEX,
    ];

    let earliest = text.length;
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match.index !== undefined && match.index < earliest) {
            earliest = match.index;
        }
    }

    return earliest < text.length ? earliest : -1;
}

// ============== PARSE NUMBERED ITEMS ==============

interface NumberedItem {
    number: string;
    startIndex: number;
    text: string;
    subItems: { letter: string; text: string }[];
}

function parseNumberedItems(text: string): NumberedItem[] {
    const items: NumberedItem[] = [];

    // Try multiple patterns for numbered items
    // Pattern 1: Arabic numerals (1., 2., 3., ...)
    // Pattern 2: Roman numerals (I., II., III., ...)
    // Pattern 3: Parenthesized numbers ((1), (2), ...)
    const arabicRegex = /(?:^|\n)\s*(\d+)\.\s+/gm;
    const romanRegex = /(?:^|\n)\s*([IVXLC]+)\.\s+/gm;
    const parenRegex = /(?:^|\n)\s*\((\d+)\)\s+/gm;

    // Try Arabic numerals first
    let matches: { number: string; index: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = arabicRegex.exec(text)) !== null) {
        matches.push({
            number: match[1],
            index: match.index,
        });
    }

    // If no Arabic numerals found, try Roman
    if (matches.length === 0) {
        while ((match = romanRegex.exec(text)) !== null) {
            matches.push({
                number: match[1],
                index: match.index,
            });
        }
    }

    // If still nothing, try parenthesized
    if (matches.length === 0) {
        while ((match = parenRegex.exec(text)) !== null) {
            matches.push({
                number: match[1],
                index: match.index,
            });
        }
    }

    console.log(`[SE] Found ${matches.length} numbered items`);

    for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const next = matches[i + 1];
        const endIndex = next ? next.index : text.length;
        const itemText = text.substring(current.index, endIndex).trim();

        // Parse sub-items (a., b., c.)
        const subItems: { letter: string; text: string }[] = [];
        const subRegex = /(?:^|\n)\s*([a-z])\.\s+/gm;
        const subMatches: { letter: string; index: number }[] = [];
        let subMatch: RegExpExecArray | null;

        while ((subMatch = subRegex.exec(itemText)) !== null) {
            // Only count sub-items after the first line
            if (subMatch.index > 10) {
                subMatches.push({
                    letter: subMatch[1],
                    index: subMatch.index,
                });
            }
        }

        for (let j = 0; j < subMatches.length; j++) {
            const currentSub = subMatches[j];
            const nextSub = subMatches[j + 1];
            const subEndIndex = nextSub ? nextSub.index : itemText.length;
            const subText = itemText.substring(currentSub.index, subEndIndex).trim();

            subItems.push({
                letter: currentSub.letter,
                text: subText,
            });
        }

        items.push({
            number: current.number,
            startIndex: current.index,
            text: itemText,
            subItems,
        });
    }

    return items;
}

// ============== MAIN PARSER ==============

/**
 * Parse an SE document into structured sections and chunks
 */
export function parseSE(rawText: string): SeParseResult {
    // 1. Clean text
    const cleanedText = cleanSEText(rawText);

    // 2. Extract identity
    const identity = extractSEIdentity(cleanedText);
    console.log(`[SE] Extracted identity: ${JSON.stringify(identity)}`);

    // 3. Find structural boundaries
    const pembukaStart = findPembukaStart(cleanedText);
    const firstItemStart = findFirstNumberedItem(cleanedText);
    const penutupStart = findPenutupStart(cleanedText);

    console.log(`[SE] Boundaries - Pembuka: ${pembukaStart}, First Item: ${firstItemStart}, Penutup: ${penutupStart}`);

    // 4. Build sections
    const sections: SeSection[] = [];

    // Header section
    const headerEnd = pembukaStart > 0 ? pembukaStart : (firstItemStart > 0 ? firstItemStart : cleanedText.length);
    if (headerEnd > 50) {
        sections.push({
            type: 'HEADER',
            title: 'Header',
            startOffset: 0,
            endOffset: headerEnd,
            text: cleanedText.substring(0, headerEnd).trim(),
        });
    }

    // Pembuka section
    if (pembukaStart >= 0) {
        const pembukaEnd = firstItemStart > pembukaStart ? firstItemStart : (penutupStart > pembukaStart ? penutupStart : cleanedText.length);
        sections.push({
            type: 'PEMBUKA',
            title: 'Pembuka',
            startOffset: pembukaStart,
            endOffset: pembukaEnd,
            text: cleanedText.substring(pembukaStart, pembukaEnd).trim(),
        });
    }

    // Isi Pokok section
    if (firstItemStart >= 0) {
        const isiEnd = penutupStart > firstItemStart ? penutupStart : cleanedText.length;
        sections.push({
            type: 'ISI_POKOK',
            title: 'Isi Pokok',
            startOffset: firstItemStart,
            endOffset: isiEnd,
            text: cleanedText.substring(firstItemStart, isiEnd).trim(),
        });
    }

    // Penutup section
    if (penutupStart >= 0 && penutupStart < cleanedText.length) {
        sections.push({
            type: 'PENUTUP',
            title: 'Penutup',
            startOffset: penutupStart,
            endOffset: cleanedText.length,
            text: cleanedText.substring(penutupStart).trim(),
        });
    }

    // 5. Build chunks
    const chunks: SeChunk[] = [];
    let orderIndex = 0;

    // Header chunk
    const headerSection = sections.find(s => s.type === 'HEADER');
    if (headerSection && headerSection.text.length > 30) {
        chunks.push({
            chunkType: 'PREAMBLE',
            title: 'Header SE',
            anchorCitation: generateAnchorCitation(identity, 'HEADER'),
            text: headerSection.text,
            orderIndex: orderIndex++,
            legalRefs: [],
            tokenEstimate: estimateTokens(headerSection.text),
        });
    }

    // Pembuka chunk
    const pembukaSection = sections.find(s => s.type === 'PEMBUKA');
    if (pembukaSection && pembukaSection.text.length > 30) {
        chunks.push({
            chunkType: 'SECTION',
            title: 'Pembuka',
            anchorCitation: generateAnchorCitation(identity, 'PEMBUKA'),
            text: pembukaSection.text,
            orderIndex: orderIndex++,
            legalRefs: extractLegalRefs(pembukaSection.text),
            tokenEstimate: estimateTokens(pembukaSection.text),
        });
    }

    // Isi Pokok chunks (numbered items)
    const isiSection = sections.find(s => s.type === 'ISI_POKOK');
    if (isiSection) {
        const numberedItems = parseNumberedItems(isiSection.text);

        for (const item of numberedItems) {
            // Main item chunk
            const itemId = `item-${item.number}`;
            chunks.push({
                chunkType: 'SECTION',
                title: `Poin ${item.number}`,
                anchorCitation: generateAnchorCitation(identity, 'ITEM', { itemNumber: item.number }),
                text: item.text,
                orderIndex: orderIndex++,
                itemNumber: item.number,
                legalRefs: extractLegalRefs(item.text),
                tokenEstimate: estimateTokens(item.text),
            });

            // Sub-item chunks
            for (const subItem of item.subItems) {
                chunks.push({
                    chunkType: 'SUBSECTION',
                    title: `Poin ${item.number} Huruf ${subItem.letter}`,
                    anchorCitation: generateAnchorCitation(identity, 'SUBITEM', { itemNumber: item.number, subItemLetter: subItem.letter }),
                    text: subItem.text,
                    orderIndex: orderIndex++,
                    parentId: itemId,
                    itemNumber: item.number,
                    subItemLetter: subItem.letter,
                    legalRefs: extractLegalRefs(subItem.text),
                    tokenEstimate: estimateTokens(subItem.text),
                });
            }
        }
    }

    // Penutup chunk
    const penutupSection = sections.find(s => s.type === 'PENUTUP');
    if (penutupSection && penutupSection.text.length > 30) {
        chunks.push({
            chunkType: 'SECTION',
            title: 'Penutup',
            anchorCitation: generateAnchorCitation(identity, 'PENUTUP'),
            text: penutupSection.text,
            orderIndex: orderIndex++,
            legalRefs: [],
            tokenEstimate: estimateTokens(penutupSection.text),
        });
    }

    // 6. Collect all legal refs
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

    console.log(`[SE] Parsed ${sections.length} sections, ${chunks.length} chunks`);

    return {
        identity,
        sections,
        chunks,
        legalRefs: allLegalRefs,
    };
}
