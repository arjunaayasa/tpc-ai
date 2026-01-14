/**
 * Nota Dinas Extractor - Parse Nota Dinas documents
 * Handles: Header, Pembuka, Isi Pokok (numbered items), Penegasan, Penutup, Lampiran
 */

import {
    NOTA_DINAS_HEADER_REGEX,
    ND_NOMOR_REGEX,
    YTH_REGEX,
    DARI_REGEX,
    SIFAT_REGEX,
    HAL_REGEX,
    TANGGAL_REGEX,
    LAMPIRAN_COUNT_REGEX,
    SEHUBUNGAN_REGEX,
    MENINDAKLANJUTI_REGEX,
    BERDASARKAN_REGEX,
    MERUJUK_REGEX,
    NUMBERED_ITEM_GLOBAL_REGEX,
    LETTERED_SUBITEM_GLOBAL_REGEX,
    NUMBERED_SUBSUBITEM_GLOBAL_REGEX,
    DEMIKIAN_REGEX,
    AN_DIREKTUR_REGEX,
    TEMBUSAN_REGEX,
    DENGAN_PENEGASAN_REGEX,
    LAMPIRAN_HEADER_REGEX,
    LAMPIRAN_LETTER_GLOBAL_REGEX,
    PAGE_NUMBER_REGEX,
    PAGE_HEADER_REGEX,
    LEGAL_REF_REGEX,
} from './notaDinasRegex';
import { NotaDinasIdentity, NotaDinasSection, NotaDinasChunk, NotaDinasParseResult, NotaDinasChunkType } from './notaDinasTypes';

// ============== TEXT CLEANING ==============

/**
 * Clean raw text from Nota Dinas document
 */
export function cleanNotaDinasText(rawText: string): string {
    let text = rawText
        // Normalize line endings
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Remove page numbers
        .replace(PAGE_NUMBER_REGEX, '')
        // Remove page headers/footers
        .replace(PAGE_HEADER_REGEX, '')
        // Fix multiple spaces
        .replace(/[ \t]+/g, ' ')
        // Fix multiple newlines (max 2)
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return text;
}

// ============== IDENTITY EXTRACTION ==============

/**
 * Extract Nota Dinas identity (nomor, tanggal, hal, dari, kepada, etc.)
 */
export function extractNotaDinasIdentity(text: string): NotaDinasIdentity {
    const identity: NotaDinasIdentity = {
        nomor: null,
        tanggal: null,
        hal: null,
        sifat: null,
        dari: null,
        kepada: [],
        lampiran: null,
    };

    // Extract Nomor
    const nomorMatch = text.match(ND_NOMOR_REGEX);
    if (nomorMatch) {
        identity.nomor = nomorMatch[1].replace(/\s+/g, '').trim();
    }

    // Extract Yth (Kepada)
    const ythMatch = text.match(YTH_REGEX);
    if (ythMatch) {
        const kepadaText = ythMatch[1].trim();
        // Split by common delimiters
        identity.kepada = kepadaText.split(/[,;\n]/).map(k => k.trim()).filter(k => k.length > 0);
    }

    // Extract Dari
    const dariMatch = text.match(DARI_REGEX);
    if (dariMatch) {
        identity.dari = dariMatch[1].trim().split('\n')[0].trim();
    }

    // Extract Sifat
    const sifatMatch = text.match(SIFAT_REGEX);
    if (sifatMatch) {
        identity.sifat = sifatMatch[1].trim();
    }

    // Extract Hal
    const halMatch = text.match(HAL_REGEX);
    if (halMatch) {
        identity.hal = halMatch[1].trim().replace(/\n+/g, ' ').trim();
    }

    // Extract Tanggal
    const tanggalMatch = text.match(TANGGAL_REGEX);
    if (tanggalMatch) {
        identity.tanggal = tanggalMatch[1].trim();
    }

    // Extract Lampiran count
    const lampiranMatch = text.match(LAMPIRAN_COUNT_REGEX);
    if (lampiranMatch) {
        identity.lampiran = lampiranMatch[1].trim();
    }

    return identity;
}

// ============== UTILITIES ==============

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function extractLegalRefs(text: string): string[] {
    const matches = text.match(LEGAL_REF_REGEX);
    if (!matches) return [];

    // Deduplicate and normalize
    const refs = new Set<string>();
    for (const match of matches) {
        refs.add(match.toUpperCase().replace(/\s+/g, ' ').trim());
    }
    return Array.from(refs);
}

// ============== ANCHOR CITATION ==============

function generateNDAnchorCitation(
    identity: NotaDinasIdentity,
    type: 'HEADER' | 'PEMBUKA' | 'ITEM' | 'SUBITEM' | 'SUBSUBITEM' | 'PENEGASAN' | 'PENUTUP' | 'LAMPIRAN',
    options?: {
        itemNumber?: string;
        subItemLetter?: string;
        subSubItemNumber?: string;
        lampiranLetter?: string;
    }
): string {
    const nomor = identity.nomor || 'ND';

    switch (type) {
        case 'HEADER':
            return `${nomor} - Header`;
        case 'PEMBUKA':
            return `${nomor} - Pembuka`;
        case 'ITEM':
            return `${nomor} - Poin ${options?.itemNumber || '?'}`;
        case 'SUBITEM':
            return `${nomor} - Poin ${options?.itemNumber || '?'} Huruf ${options?.subItemLetter || '?'}`;
        case 'SUBSUBITEM':
            return `${nomor} - Poin ${options?.itemNumber || '?'} Huruf ${options?.subItemLetter || '?'} Angka ${options?.subSubItemNumber || '?'}`;
        case 'PENEGASAN':
            return `${nomor} - Penegasan`;
        case 'PENUTUP':
            return `${nomor} - Penutup`;
        case 'LAMPIRAN':
            return `${nomor} - Lampiran ${options?.lampiranLetter || '?'}`;
        default:
            return nomor;
    }
}

// ============== BOUNDARY DETECTION ==============

/**
 * Find pembuka start index
 */
function findPembukaStart(text: string): number {
    const patterns = [SEHUBUNGAN_REGEX, MENINDAKLANJUTI_REGEX, BERDASARKAN_REGEX, MERUJUK_REGEX];

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
 * Find first numbered item position
 */
function findFirstNumberedItem(text: string): number {
    // Reset regex state
    const regex = /^\d+\.\s+/gm;
    const match = regex.exec(text);

    if (match && match.index !== undefined) {
        // Check if it's actually a main item (not part of header)
        const contextBefore = text.substring(Math.max(0, match.index - 50), match.index);
        const looksLikeHeader = /(?:Hal|Lampiran|Sifat|Dari|Yth)\s*:\s*$/i.test(contextBefore);
        if (!looksLikeHeader) {
            return match.index;
        }
    }

    return -1;
}

/**
 * Find penutup start index
 */
function findPenutupStart(text: string): number {
    const patterns = [DEMIKIAN_REGEX, AN_DIREKTUR_REGEX];

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
 * Find lampiran start index
 */
function findLampiranStart(text: string): number {
    const match = text.match(LAMPIRAN_HEADER_REGEX);
    return match && match.index !== undefined ? match.index : -1;
}

/**
 * Find penegasan start index
 */
function findPenegasanStart(text: string): number {
    const match = text.match(DENGAN_PENEGASAN_REGEX);
    return match && match.index !== undefined ? match.index : -1;
}

// ============== PARSE NUMBERED ITEMS ==============

interface NumberedItem {
    number: string;
    startIndex: number;
    text: string;
    subItems: SubItem[];
}

interface SubItem {
    letter: string;
    text: string;
    subSubItems: { number: string; text: string }[];
}

function parseNumberedItems(text: string): NumberedItem[] {
    const items: NumberedItem[] = [];

    // Find all numbered item positions
    const itemPositions: { number: string; index: number }[] = [];
    const regex = /^(\d+)\.\s+/gm;
    let match;

    while ((match = regex.exec(text)) !== null) {
        itemPositions.push({
            number: match[1],
            index: match.index,
        });
    }

    if (itemPositions.length === 0) return items;

    // Extract each numbered item's content
    for (let i = 0; i < itemPositions.length; i++) {
        const current = itemPositions[i];
        const nextIndex = itemPositions[i + 1]?.index ?? text.length;

        const itemText = text.substring(current.index, nextIndex).trim();

        // Parse sub-items within this item
        const subItems = parseSubItems(itemText);

        items.push({
            number: current.number,
            startIndex: current.index,
            text: itemText,
            subItems,
        });
    }

    return items;
}

function parseSubItems(itemText: string): SubItem[] {
    const subItems: SubItem[] = [];

    // Find all lettered sub-item positions
    const subItemPositions: { letter: string; index: number }[] = [];
    const regex = /^([a-z])\.\s+/gm;
    let match;

    while ((match = regex.exec(itemText)) !== null) {
        // Skip if too close to start (part of main item text)
        if (match.index > 10) {
            subItemPositions.push({
                letter: match[1],
                index: match.index,
            });
        }
    }

    if (subItemPositions.length === 0) return subItems;

    for (let i = 0; i < subItemPositions.length; i++) {
        const current = subItemPositions[i];
        const nextIndex = subItemPositions[i + 1]?.index ?? itemText.length;

        const subItemText = itemText.substring(current.index, nextIndex).trim();

        // Parse sub-sub-items within this sub-item
        const subSubItems = parseSubSubItems(subItemText);

        subItems.push({
            letter: current.letter,
            text: subItemText,
            subSubItems,
        });
    }

    return subItems;
}

function parseSubSubItems(subItemText: string): { number: string; text: string }[] {
    const subSubItems: { number: string; text: string }[] = [];

    // Find all numbered sub-sub-item positions (1), 2), etc.)
    const positions: { number: string; index: number }[] = [];
    const regex = /^(\d+)\)\s+/gm;
    let match;

    while ((match = regex.exec(subItemText)) !== null) {
        if (match.index > 5) {
            positions.push({
                number: match[1],
                index: match.index,
            });
        }
    }

    if (positions.length === 0) return subSubItems;

    for (let i = 0; i < positions.length; i++) {
        const current = positions[i];
        const nextIndex = positions[i + 1]?.index ?? subItemText.length;

        subSubItems.push({
            number: current.number,
            text: subItemText.substring(current.index, nextIndex).trim(),
        });
    }

    return subSubItems;
}

// ============== PARSE LAMPIRAN ==============

interface LampiranSection {
    letter: string;
    text: string;
}

function parseLampiranSections(lampiranText: string): LampiranSection[] {
    const sections: LampiranSection[] = [];

    const positions: { letter: string; index: number }[] = [];
    const regex = /^([A-Z])\.\s+/gm;
    let match;

    while ((match = regex.exec(lampiranText)) !== null) {
        positions.push({
            letter: match[1],
            index: match.index,
        });
    }

    if (positions.length === 0) {
        // No lettered sections, return whole lampiran as one section
        if (lampiranText.trim().length > 50) {
            sections.push({
                letter: 'A',
                text: lampiranText.trim(),
            });
        }
        return sections;
    }

    for (let i = 0; i < positions.length; i++) {
        const current = positions[i];
        const nextIndex = positions[i + 1]?.index ?? lampiranText.length;

        sections.push({
            letter: current.letter,
            text: lampiranText.substring(current.index, nextIndex).trim(),
        });
    }

    return sections;
}

// ============== MAIN PARSER ==============

/**
 * Parse a Nota Dinas document into structured sections and chunks
 */
export function parseNotaDinas(rawText: string): NotaDinasParseResult {
    const cleanedText = cleanNotaDinasText(rawText);
    const identity = extractNotaDinasIdentity(cleanedText);

    const sections: NotaDinasSection[] = [];
    const chunks: NotaDinasChunk[] = [];
    const allLegalRefs: string[] = [];

    let orderIndex = 0;

    // Find section boundaries
    const pembukaStart = findPembukaStart(cleanedText);
    const firstItemStart = findFirstNumberedItem(cleanedText);
    const penegasanStart = findPenegasanStart(cleanedText);
    const penutupStart = findPenutupStart(cleanedText);
    const lampiranStart = findLampiranStart(cleanedText);

    // Debug logging
    console.log(`[NotaDinas] Boundaries: pembuka=${pembukaStart}, firstItem=${firstItemStart}, penegasan=${penegasanStart}, penutup=${penutupStart}, lampiran=${lampiranStart}`);
    console.log(`[NotaDinas] Text length: ${cleanedText.length}`);

    // Determine isi pokok boundaries
    let isiPokokStart = firstItemStart > 0 ? firstItemStart : pembukaStart + 1;
    let isiPokokEnd = cleanedText.length;

    if (penegasanStart > isiPokokStart) {
        isiPokokEnd = penegasanStart;
    } else if (penutupStart > isiPokokStart) {
        isiPokokEnd = penutupStart;
    }

    if (lampiranStart > 0 && lampiranStart < isiPokokEnd) {
        isiPokokEnd = lampiranStart;
    }

    // 1. HEADER Section
    const headerEnd = pembukaStart > 0 ? pembukaStart : (firstItemStart > 0 ? firstItemStart : 500);
    const headerText = cleanedText.substring(0, headerEnd).trim();

    if (headerText.length > 0) {
        sections.push({
            type: 'HEADER',
            title: 'Header',
            startOffset: 0,
            endOffset: headerEnd,
            text: headerText,
        });

        // Don't create header chunk for embedding (skip)
    }

    // 2. PEMBUKA Section
    if (pembukaStart > 0) {
        const pembukaEnd = firstItemStart > pembukaStart ? firstItemStart :
            (penutupStart > pembukaStart ? penutupStart : cleanedText.length);
        const pembukaText = cleanedText.substring(pembukaStart, pembukaEnd).trim();

        sections.push({
            type: 'PEMBUKA',
            title: 'Pembuka',
            startOffset: pembukaStart,
            endOffset: pembukaEnd,
            text: pembukaText,
        });

        if (pembukaText.length > 50) {
            chunks.push({
                chunkType: 'ND_PEMBUKA',
                title: 'Pembuka',
                anchorCitation: generateNDAnchorCitation(identity, 'PEMBUKA'),
                text: pembukaText,
                orderIndex: orderIndex++,
                legalRefs: extractLegalRefs(pembukaText),
                tokenEstimate: estimateTokens(pembukaText),
            });
        }
    }

    // 3. ISI POKOK Section - Only if numbered items exist
    if (firstItemStart > 0) {
        const isiPokokText = cleanedText.substring(isiPokokStart, isiPokokEnd).trim();

        sections.push({
            type: 'ISI_POKOK',
            title: 'Isi Pokok',
            startOffset: isiPokokStart,
            endOffset: isiPokokEnd,
            text: isiPokokText,
        });

        // Parse numbered items
        const numberedItems = parseNumberedItems(isiPokokText);
        console.log(`[NotaDinas] Found ${numberedItems.length} numbered items`);

        for (const item of numberedItems) {
            const itemLegalRefs = extractLegalRefs(item.text);
            allLegalRefs.push(...itemLegalRefs);

            // Create chunk for main item
            const itemChunk: NotaDinasChunk = {
                chunkType: 'ND_ISI_ITEM',
                title: `Poin ${item.number}`,
                anchorCitation: generateNDAnchorCitation(identity, 'ITEM', { itemNumber: item.number }),
                text: item.text,
                orderIndex: orderIndex++,
                itemNumber: item.number,
                legalRefs: itemLegalRefs,
                tokenEstimate: estimateTokens(item.text),
            };
            chunks.push(itemChunk);

            // Create chunks for sub-items
            for (const subItem of item.subItems) {
                const subItemLegalRefs = extractLegalRefs(subItem.text);

                chunks.push({
                    chunkType: 'ND_SUB_ITEM',
                    title: `Poin ${item.number} Huruf ${subItem.letter}`,
                    anchorCitation: generateNDAnchorCitation(identity, 'SUBITEM', {
                        itemNumber: item.number,
                        subItemLetter: subItem.letter
                    }),
                    text: subItem.text,
                    orderIndex: orderIndex++,
                    itemNumber: item.number,
                    subItemLetter: subItem.letter,
                    legalRefs: subItemLegalRefs,
                    tokenEstimate: estimateTokens(subItem.text),
                });

                // Create chunks for sub-sub-items
                for (const subSubItem of subItem.subSubItems) {
                    chunks.push({
                        chunkType: 'ND_SUB_SUB_ITEM',
                        title: `Poin ${item.number} Huruf ${subItem.letter} Angka ${subSubItem.number}`,
                        anchorCitation: generateNDAnchorCitation(identity, 'SUBSUBITEM', {
                            itemNumber: item.number,
                            subItemLetter: subItem.letter,
                            subSubItemNumber: subSubItem.number,
                        }),
                        text: subSubItem.text,
                        orderIndex: orderIndex++,
                        itemNumber: item.number,
                        subItemLetter: subItem.letter,
                        subSubItemNumber: subSubItem.number,
                        legalRefs: extractLegalRefs(subSubItem.text),
                        tokenEstimate: estimateTokens(subSubItem.text),
                    });
                }
            }
        }
    } else {
        // FALLBACK: No numbered items found, create content chunk from body
        console.log(`[NotaDinas] No numbered items, creating fallback content chunk`);

        const bodyStart = pembukaStart > 0 ? pembukaStart : headerEnd;
        const bodyEnd = penutupStart > bodyStart ? penutupStart : cleanedText.length;
        const bodyText = cleanedText.substring(bodyStart, bodyEnd).trim();

        if (bodyText.length > 100) {
            sections.push({
                type: 'ISI_POKOK',
                title: 'Isi Pokok',
                startOffset: bodyStart,
                endOffset: bodyEnd,
                text: bodyText,
            });

            chunks.push({
                chunkType: 'ND_ISI_ITEM',
                title: 'Isi Nota Dinas',
                anchorCitation: generateNDAnchorCitation(identity, 'ITEM', { itemNumber: '1' }),
                text: bodyText,
                orderIndex: orderIndex++,
                itemNumber: '1',
                legalRefs: extractLegalRefs(bodyText),
                tokenEstimate: estimateTokens(bodyText),
            });
        }
    }

    // 4. PENEGASAN Section
    if (penegasanStart > 0) {
        const penegasanEnd = penutupStart > penegasanStart ? penutupStart :
            (lampiranStart > penegasanStart ? lampiranStart : cleanedText.length);
        const penegasanText = cleanedText.substring(penegasanStart, penegasanEnd).trim();

        sections.push({
            type: 'PENEGASAN',
            title: 'Penegasan',
            startOffset: penegasanStart,
            endOffset: penegasanEnd,
            text: penegasanText,
        });

        if (penegasanText.length > 30) {
            chunks.push({
                chunkType: 'ND_PENEGASAN',
                title: 'Penegasan',
                anchorCitation: generateNDAnchorCitation(identity, 'PENEGASAN'),
                text: penegasanText,
                orderIndex: orderIndex++,
                legalRefs: extractLegalRefs(penegasanText),
                tokenEstimate: estimateTokens(penegasanText),
            });
        }
    }

    // 5. PENUTUP Section
    if (penutupStart > 0) {
        const penutupEnd = lampiranStart > penutupStart ? lampiranStart : cleanedText.length;
        const penutupText = cleanedText.substring(penutupStart, penutupEnd).trim();

        sections.push({
            type: 'PENUTUP',
            title: 'Penutup',
            startOffset: penutupStart,
            endOffset: penutupEnd,
            text: penutupText,
        });

        // Don't create penutup chunk for embedding (skip)
    }

    // 6. LAMPIRAN Section
    if (lampiranStart > 0) {
        const lampiranText = cleanedText.substring(lampiranStart).trim();

        sections.push({
            type: 'LAMPIRAN',
            title: 'Lampiran',
            startOffset: lampiranStart,
            endOffset: cleanedText.length,
            text: lampiranText,
        });

        // Parse lampiran sections (A., B., C., etc.)
        const lampiranSections = parseLampiranSections(lampiranText);

        for (const section of lampiranSections) {
            chunks.push({
                chunkType: 'ND_LAMPIRAN_SECTION',
                title: `Lampiran ${section.letter}`,
                anchorCitation: generateNDAnchorCitation(identity, 'LAMPIRAN', { lampiranLetter: section.letter }),
                text: section.text,
                orderIndex: orderIndex++,
                lampiranLetter: section.letter,
                legalRefs: extractLegalRefs(section.text),
                tokenEstimate: estimateTokens(section.text),
            });
        }
    }

    // Deduplicate legal refs
    const uniqueLegalRefs = [...new Set(allLegalRefs)];

    return {
        identity,
        sections,
        chunks,
        legalRefs: uniqueLegalRefs,
    };
}
