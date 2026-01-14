/**
 * PMK Naskah Extractor - Parse official PMK regulation text
 * Handles: Header, Menimbang, Mengingat, MEMUTUSKAN, BAB, Bagian, Pasal, Ayat, Penutup
 */

import {
    PMK_HEADER_REGEX,
    PMK_NOMOR_REGEX,
    TENTANG_REGEX,
    MENIMBANG_REGEX,
    MENGINGAT_REGEX,
    MEMUTUSKAN_REGEX,
    MENETAPKAN_REGEX,
    BAB_GLOBAL_REGEX,
    BAGIAN_GLOBAL_REGEX,
    PASAL_GLOBAL_REGEX,
    AYAT_GLOBAL_REGEX,
    DITETAPKAN_REGEX,
    DIUNDANGKAN_REGEX,
    PAGE_NUMBER_REGEX,
    PAGE_HEADER_REGEX,
    PASAL_REF_REGEX,
    TANGGAL_TERBIT_REGEX,
    TANGGAL_BERLAKU_REGEX,
} from './pmkRegex';
import { PmkIdentity, PmkSection, PmkChunk, PmkParseResult, PmkChunkType } from './pmkTypes';

// ============== TEXT CLEANING ==============

/**
 * Clean raw text by removing page numbers, headers/footers
 */
export function cleanPMKText(rawText: string): string {
    let text = rawText;

    // Normalize whitespace
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');

    // Fix common PDF extraction issues
    // Fix "P a s a l" with spaces between letters
    text = text.replace(/P\s*a\s*s\s*a\s*l/gi, 'Pasal');
    // Fix "B A B" with spaces
    text = text.replace(/B\s*A\s*B/gi, 'BAB');
    // Fix "A y a t" with spaces
    text = text.replace(/A\s*y\s*a\s*t/gi, 'Ayat');
    // Fix multiple spaces within words
    text = text.replace(/[ \t]+/g, ' ');

    // Remove isolated page numbers
    text = text.replace(PAGE_NUMBER_REGEX, '');

    // Remove repeated headers/footers with page numbers
    text = text.replace(PAGE_HEADER_REGEX, '');

    // Remove multiple consecutive newlines (more than 2)
    text = text.replace(/\n{3,}/g, '\n\n');

    // Trim lines
    text = text.split('\n').map(line => line.trimEnd()).join('\n');

    return text.trim();
}

// ============== IDENTITY EXTRACTION ==============

/**
 * Extract PMK identity (nomor, tahun, tentang)
 */
export function extractPMKIdentity(text: string): PmkIdentity {
    let nomor: string | null = null;
    let tahun: number | null = null;
    let tentang: string | null = null;
    let tanggalTerbit: string | null = null;
    let tanggalBerlaku: string | null = null;

    // Extract nomor
    const nomorMatch = text.match(PMK_NOMOR_REGEX);
    if (nomorMatch) {
        nomor = nomorMatch[1].trim();

        // Try to extract year from nomor pattern like "168/PMK.010/2023"
        const yearMatch = nomor.match(/\/(\d{4})$/);
        if (yearMatch) {
            tahun = parseInt(yearMatch[1], 10);
        } else {
            // Try "TAHUN 2023" pattern
            const tahunMatch = nomor.match(/TAHUN\s+(\d{4})/i);
            if (tahunMatch) {
                tahun = parseInt(tahunMatch[1], 10);
            }
        }
    }

    // If year not found in nomor, look in first 1000 chars
    if (!tahun) {
        const header = text.substring(0, 1000);
        const yearPatterns = [
            /TAHUN\s+(\d{4})/i,
            /\/(\d{4})(?:\s|$)/,
            /\b(20[0-2]\d)\b/,
        ];
        for (const pattern of yearPatterns) {
            const match = header.match(pattern);
            if (match) {
                const year = parseInt(match[1], 10);
                if (year >= 2000 && year <= 2100) {
                    tahun = year;
                    break;
                }
            }
        }
    }

    // Extract TENTANG
    const tentangMatch = text.match(TENTANG_REGEX);
    if (tentangMatch) {
        tentang = tentangMatch[1].trim()
            .replace(/\s+/g, ' ')
            .replace(/\n/g, ' ')
            .substring(0, 500); // Limit length
    }

    // Extract tanggal terbit
    const terbitMatch = text.match(TANGGAL_TERBIT_REGEX);
    if (terbitMatch) {
        tanggalTerbit = terbitMatch[1].trim();
    }

    // Extract tanggal berlaku
    const berlakuMatch = text.match(TANGGAL_BERLAKU_REGEX);
    if (berlakuMatch) {
        tanggalBerlaku = berlakuMatch[1].trim();
    }

    return { nomor, tahun, tentang, tanggalTerbit, tanggalBerlaku };
}

// ============== TOKEN ESTIMATION ==============

function estimateTokens(text: string): number {
    // Rough estimation: ~4 chars per token for Indonesian
    return Math.ceil(text.length / 4);
}

// ============== LEGAL REFERENCE EXTRACTION ==============

function extractLegalRefs(text: string): string[] {
    const refs: string[] = [];
    const regex = new RegExp(PASAL_REF_REGEX.source, 'gi');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const ref = match[0].trim();
        if (!refs.includes(ref)) {
            refs.push(ref);
        }
    }

    return refs;
}

// ============== ANCHOR CITATION GENERATION ==============

function generateAnchorCitation(
    identity: PmkIdentity,
    chunkType: PmkChunkType,
    options?: {
        bab?: string;
        bagian?: string;
        pasal?: string;
        ayat?: string;
        title?: string;
    }
): string {
    const base = identity.nomor && identity.tahun
        ? `PMK ${identity.nomor}`
        : identity.nomor
            ? `PMK ${identity.nomor}`
            : 'PMK';

    let anchor = base;

    switch (chunkType) {
        case 'PREAMBLE':
            anchor += ' - Header';
            break;
        case 'MENIMBANG':
            anchor += ' - Menimbang';
            break;
        case 'MENGINGAT':
            anchor += ' - Mengingat';
            break;
        case 'PENETAPAN':
            anchor += ' - Menetapkan';
            break;
        case 'BAB':
            anchor += ` - BAB ${options?.bab || ''}`;
            if (options?.title) anchor += ` ${options.title}`;
            break;
        case 'BAGIAN':
            anchor += ` - Bagian ${options?.bagian || ''}`;
            if (options?.title) anchor += ` ${options.title}`;
            break;
        case 'PASAL':
            anchor += ` - Pasal ${options?.pasal || ''}`;
            break;
        case 'AYAT':
            anchor += ` - Pasal ${options?.pasal || ''} Ayat (${options?.ayat || ''})`;
            break;
        case 'PENUTUP':
            anchor += ' - Penutup';
            break;
        default:
            anchor += ` - ${chunkType}`;
    }

    return anchor;
}

// ============== SECTION BOUNDARY DETECTION ==============

interface SectionBoundary {
    type: PmkChunkType;
    title: string;
    startIndex: number;
    bab?: string;
    bagian?: string;
    pasal?: string;
}

/**
 * Find structural boundaries in PMK text
 */
function findStructuralBoundaries(text: string): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];

    // Find Menimbang
    const menimbangMatch = text.match(MENIMBANG_REGEX);
    if (menimbangMatch && menimbangMatch.index !== undefined) {
        // Header is everything before Menimbang
        boundaries.push({
            type: 'PREAMBLE',
            title: 'Header',
            startIndex: 0,
        });
        boundaries.push({
            type: 'MENIMBANG',
            title: 'Menimbang',
            startIndex: menimbangMatch.index,
        });
    }

    // Find Mengingat
    const mengingatMatch = text.match(MENGINGAT_REGEX);
    if (mengingatMatch && mengingatMatch.index !== undefined) {
        boundaries.push({
            type: 'MENGINGAT',
            title: 'Mengingat',
            startIndex: mengingatMatch.index,
        });
    }

    // Find MEMUTUSKAN or Menetapkan
    const memutuskanMatch = text.match(MEMUTUSKAN_REGEX);
    const menetapkanMatch = text.match(MENETAPKAN_REGEX);
    const penetapanMatch = memutuskanMatch || menetapkanMatch;
    if (penetapanMatch && penetapanMatch.index !== undefined) {
        boundaries.push({
            type: 'PENETAPAN',
            title: 'Menetapkan',
            startIndex: penetapanMatch.index,
        });
    }

    // Find Ditetapkan/Diundangkan (Penutup)
    const ditetapkanMatch = text.match(DITETAPKAN_REGEX);
    const diundangkanMatch = text.match(DIUNDANGKAN_REGEX);
    const penutupIndex = ditetapkanMatch?.index ?? diundangkanMatch?.index;
    if (penutupIndex !== undefined) {
        boundaries.push({
            type: 'PENUTUP',
            title: 'Penutup',
            startIndex: penutupIndex,
        });
    }

    // Sort by start index
    boundaries.sort((a, b) => a.startIndex - b.startIndex);

    return boundaries;
}

/**
 * Find BAB boundaries in the body section
 */
function findBabBoundaries(bodyText: string, baseOffset: number): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];
    const regex = new RegExp(BAB_GLOBAL_REGEX.source, 'gim');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(bodyText)) !== null) {
        const roman = match[1];
        const title = match[2]?.trim() || '';
        boundaries.push({
            type: 'BAB',
            title: title,
            startIndex: baseOffset + match.index,
            bab: roman,
        });
    }

    return boundaries;
}

/**
 * Find Bagian boundaries within a section
 */
function findBagianBoundaries(text: string, baseOffset: number): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];
    const regex = new RegExp(BAGIAN_GLOBAL_REGEX.source, 'gim');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const ordinal = match[1];
        const title = match[2]?.trim() || '';
        boundaries.push({
            type: 'BAGIAN',
            title: title,
            startIndex: baseOffset + match.index,
            bagian: ordinal,
        });
    }

    return boundaries;
}

/**
 * Find Pasal boundaries within a section
 * Uses reference detection to avoid matching "dalam Pasal 21" etc.
 */
function findPasalBoundaries(text: string, baseOffset: number): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];
    const regex = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/gim;
    const seenPasals = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const pasalNum = match[1].toUpperCase();
        const matchIndex = match.index;

        // Check context before the match to see if it's a reference
        const contextStart = Math.max(0, matchIndex - 50);
        const contextBefore = text.substring(contextStart, matchIndex).toLowerCase();

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
            'penghasilan pasal', // "Pajak Penghasilan Pasal 21"
            'huruf'  // like "huruf a Pasal 28"
        ];

        const isReference = referenceIndicators.some(indicator =>
            contextBefore.includes(indicator)
        );

        // Also check: a header Pasal should be followed by newline or ayat (1)
        const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 30);
        const looksLikeHeader = /^\s*(\n|\(1\)|$)/i.test(afterMatch);

        // Only add if not a reference, or if it clearly looks like a header
        if (!isReference || looksLikeHeader) {
            if (!seenPasals.has(pasalNum)) {
                seenPasals.add(pasalNum);
                boundaries.push({
                    type: 'PASAL',
                    title: `Pasal ${pasalNum}`,
                    startIndex: baseOffset + matchIndex,
                    pasal: pasalNum,
                });
            }
        }
    }

    return boundaries;
}

// ============== CHUNK BUILDING ==============

/**
 * Parse Ayat within a Pasal text and create sub-chunks
 */
function parseAyatChunks(
    pasalText: string,
    pasalNum: string,
    identity: PmkIdentity,
    startOrderIndex: number
): PmkChunk[] {
    const ayatChunks: PmkChunk[] = [];
    const regex = new RegExp(AYAT_GLOBAL_REGEX.source, 'gm');

    const matches: { index: number; ayatNum: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(pasalText)) !== null) {
        matches.push({
            index: match.index,
            ayatNum: match[1],
        });
    }

    if (matches.length === 0) {
        // No ayat found, return empty (Pasal is atomic)
        return [];
    }

    let orderIndex = startOrderIndex;
    for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const next = matches[i + 1];

        const startOffset = current.index;
        const endOffset = next ? next.index : pasalText.length;
        const ayatText = pasalText.substring(startOffset, endOffset).trim();

        ayatChunks.push({
            chunkType: 'AYAT',
            title: `Ayat (${current.ayatNum})`,
            anchorCitation: generateAnchorCitation(identity, 'AYAT', { pasal: pasalNum, ayat: current.ayatNum }),
            text: ayatText,
            orderIndex: orderIndex++,
            pasal: pasalNum,
            ayat: current.ayatNum,
            legalRefs: extractLegalRefs(ayatText),
            tokenEstimate: estimateTokens(ayatText),
        });
    }

    return ayatChunks;
}

/**
 * Build chunks from the body section (after MEMUTUSKAN, before Penutup)
 */
function buildBodyChunks(
    bodyText: string,
    identity: PmkIdentity,
    startOrderIndex: number
): PmkChunk[] {
    const chunks: PmkChunk[] = [];
    let orderIndex = startOrderIndex;

    // Check if document has BAB structure
    const babBoundaries = findBabBoundaries(bodyText, 0);

    if (babBoundaries.length > 0) {
        // Process with BAB structure
        for (let i = 0; i < babBoundaries.length; i++) {
            const bab = babBoundaries[i];
            const nextBab = babBoundaries[i + 1];
            const babEndIndex = nextBab ? nextBab.startIndex : bodyText.length;
            const babText = bodyText.substring(bab.startIndex, babEndIndex);

            // Add BAB chunk (just the header)
            const babHeaderEnd = babText.indexOf('\n\n') !== -1 ? babText.indexOf('\n\n') : babText.indexOf('\n');
            const babHeaderText = babText.substring(0, babHeaderEnd !== -1 ? babHeaderEnd : 100).trim();

            chunks.push({
                chunkType: 'BAB',
                title: `BAB ${bab.bab} ${bab.title}`.trim(),
                anchorCitation: generateAnchorCitation(identity, 'BAB', { bab: bab.bab, title: bab.title }),
                text: babHeaderText,
                orderIndex: orderIndex++,
                bab: bab.bab,
                legalRefs: [],
                tokenEstimate: estimateTokens(babHeaderText),
            });

            // Find Bagian within BAB
            const bagianBoundaries = findBagianBoundaries(babText, 0);

            if (bagianBoundaries.length > 0) {
                // Process with Bagian structure
                for (let j = 0; j < bagianBoundaries.length; j++) {
                    const bagian = bagianBoundaries[j];
                    const nextBagian = bagianBoundaries[j + 1];
                    const bagianEndIndex = nextBagian ? nextBagian.startIndex : babText.length;
                    const bagianText = babText.substring(bagian.startIndex, bagianEndIndex);

                    // Add Bagian chunk
                    const bagianHeaderEnd = bagianText.indexOf('\n\n') !== -1 ? bagianText.indexOf('\n\n') : bagianText.indexOf('\n');
                    const bagianHeaderText = bagianText.substring(0, bagianHeaderEnd !== -1 ? bagianHeaderEnd : 100).trim();

                    chunks.push({
                        chunkType: 'BAGIAN',
                        title: `Bagian ${bagian.bagian} ${bagian.title}`.trim(),
                        anchorCitation: generateAnchorCitation(identity, 'BAGIAN', { bagian: bagian.bagian, title: bagian.title }),
                        text: bagianHeaderText,
                        orderIndex: orderIndex++,
                        bab: bab.bab,
                        bagian: bagian.bagian,
                        legalRefs: [],
                        tokenEstimate: estimateTokens(bagianHeaderText),
                    });

                    // Find Pasal within Bagian
                    const pasalBoundaries = findPasalBoundaries(bagianText, 0);
                    for (let k = 0; k < pasalBoundaries.length; k++) {
                        const pasal = pasalBoundaries[k];
                        const nextPasal = pasalBoundaries[k + 1];
                        const pasalEndIndex = nextPasal ? nextPasal.startIndex : bagianText.length;
                        const pasalText = bagianText.substring(pasal.startIndex, pasalEndIndex).trim();

                        // Add Pasal chunk
                        chunks.push({
                            chunkType: 'PASAL',
                            title: `Pasal ${pasal.pasal}`,
                            anchorCitation: generateAnchorCitation(identity, 'PASAL', { pasal: pasal.pasal }),
                            text: pasalText,
                            orderIndex: orderIndex++,
                            bab: bab.bab,
                            bagian: bagian.bagian,
                            pasal: pasal.pasal,
                            legalRefs: extractLegalRefs(pasalText),
                            tokenEstimate: estimateTokens(pasalText),
                        });

                        // Parse Ayat within Pasal
                        const ayatChunks = parseAyatChunks(pasalText, pasal.pasal!, identity, orderIndex);
                        if (ayatChunks.length > 0) {
                            for (const ayat of ayatChunks) {
                                ayat.bab = bab.bab;
                                ayat.bagian = bagian.bagian;
                                chunks.push(ayat);
                            }
                            orderIndex += ayatChunks.length;
                        }
                    }
                }
            } else {
                // No Bagian, find Pasal directly in BAB
                const pasalBoundaries = findPasalBoundaries(babText, 0);
                for (let k = 0; k < pasalBoundaries.length; k++) {
                    const pasal = pasalBoundaries[k];
                    const nextPasal = pasalBoundaries[k + 1];
                    const pasalEndIndex = nextPasal ? nextPasal.startIndex : babText.length;
                    const pasalText = babText.substring(pasal.startIndex, pasalEndIndex).trim();

                    chunks.push({
                        chunkType: 'PASAL',
                        title: `Pasal ${pasal.pasal}`,
                        anchorCitation: generateAnchorCitation(identity, 'PASAL', { pasal: pasal.pasal }),
                        text: pasalText,
                        orderIndex: orderIndex++,
                        bab: bab.bab,
                        pasal: pasal.pasal,
                        legalRefs: extractLegalRefs(pasalText),
                        tokenEstimate: estimateTokens(pasalText),
                    });

                    // Parse Ayat
                    const ayatChunks = parseAyatChunks(pasalText, pasal.pasal!, identity, orderIndex);
                    if (ayatChunks.length > 0) {
                        for (const ayat of ayatChunks) {
                            ayat.bab = bab.bab;
                            chunks.push(ayat);
                        }
                        orderIndex += ayatChunks.length;
                    }
                }
            }
        }
    } else {
        // No BAB structure - directly parse Pasal
        const pasalBoundaries = findPasalBoundaries(bodyText, 0);
        for (let i = 0; i < pasalBoundaries.length; i++) {
            const pasal = pasalBoundaries[i];
            const nextPasal = pasalBoundaries[i + 1];
            const pasalEndIndex = nextPasal ? nextPasal.startIndex : bodyText.length;
            const pasalText = bodyText.substring(pasal.startIndex, pasalEndIndex).trim();

            chunks.push({
                chunkType: 'PASAL',
                title: `Pasal ${pasal.pasal}`,
                anchorCitation: generateAnchorCitation(identity, 'PASAL', { pasal: pasal.pasal }),
                text: pasalText,
                orderIndex: orderIndex++,
                pasal: pasal.pasal,
                legalRefs: extractLegalRefs(pasalText),
                tokenEstimate: estimateTokens(pasalText),
            });

            // Parse Ayat
            const ayatChunks = parseAyatChunks(pasalText, pasal.pasal!, identity, orderIndex);
            chunks.push(...ayatChunks);
            orderIndex += ayatChunks.length;
        }
    }

    return chunks;
}

// ============== MAIN PARSER ==============

/**
 * Parse a PMK NASKAH document into structured sections and chunks
 */
export function parsePMKNaskah(rawText: string): PmkParseResult {
    // 1. Clean text
    const cleanedText = cleanPMKText(rawText);

    // 2. Extract identity
    const identity = extractPMKIdentity(cleanedText);
    console.log(`[PMK Naskah] Extracted identity: ${JSON.stringify(identity)}`);

    // 3. Find structural boundaries
    const boundaries = findStructuralBoundaries(cleanedText);

    // 4. Build sections
    const sections: PmkSection[] = [];
    for (let i = 0; i < boundaries.length; i++) {
        const current = boundaries[i];
        const next = boundaries[i + 1];
        const endIndex = next ? next.startIndex : cleanedText.length;
        const sectionText = cleanedText.substring(current.startIndex, endIndex).trim();

        sections.push({
            type: current.type,
            title: current.title,
            startOffset: current.startIndex,
            endOffset: endIndex,
            text: sectionText,
        });
    }

    // 5. Build chunks
    const chunks: PmkChunk[] = [];
    let orderIndex = 0;

    for (const section of sections) {
        if (section.type === 'PREAMBLE') {
            chunks.push({
                chunkType: 'PREAMBLE',
                title: 'Header PMK',
                anchorCitation: generateAnchorCitation(identity, 'PREAMBLE'),
                text: section.text,
                orderIndex: orderIndex++,
                legalRefs: [],
                tokenEstimate: estimateTokens(section.text),
            });
        } else if (section.type === 'MENIMBANG') {
            chunks.push({
                chunkType: 'MENIMBANG',
                title: 'Menimbang',
                anchorCitation: generateAnchorCitation(identity, 'MENIMBANG'),
                text: section.text,
                orderIndex: orderIndex++,
                legalRefs: [],
                tokenEstimate: estimateTokens(section.text),
            });
        } else if (section.type === 'MENGINGAT') {
            chunks.push({
                chunkType: 'MENGINGAT',
                title: 'Mengingat',
                anchorCitation: generateAnchorCitation(identity, 'MENGINGAT'),
                text: section.text,
                orderIndex: orderIndex++,
                legalRefs: extractLegalRefs(section.text),
                tokenEstimate: estimateTokens(section.text),
            });
        } else if (section.type === 'PENETAPAN') {
            // The body is after PENETAPAN, before PENUTUP
            // Split at first Pasal or BAB
            // Allow leading whitespace for pdfplumber output
            const firstPasalMatch = section.text.match(/^\s*Pasal\s+\d+/im);
            const firstBabMatch = section.text.match(/^\s*BAB\s+[IVXLC]+/im);

            const bodyStart = Math.min(
                firstPasalMatch?.index ?? section.text.length,
                firstBabMatch?.index ?? section.text.length
            );

            // Add penetapan header
            const penetapanHeader = section.text.substring(0, bodyStart).trim();
            if (penetapanHeader) {
                chunks.push({
                    chunkType: 'PENETAPAN',
                    title: 'Menetapkan',
                    anchorCitation: generateAnchorCitation(identity, 'PENETAPAN'),
                    text: penetapanHeader,
                    orderIndex: orderIndex++,
                    legalRefs: [],
                    tokenEstimate: estimateTokens(penetapanHeader),
                });
            }

            // Process body (BAB/Pasal/Ayat)
            const bodyText = section.text.substring(bodyStart);
            const bodyChunks = buildBodyChunks(bodyText, identity, orderIndex);
            chunks.push(...bodyChunks);
            orderIndex += bodyChunks.length;
        } else if (section.type === 'PENUTUP') {
            chunks.push({
                chunkType: 'PENUTUP',
                title: 'Penutup',
                anchorCitation: generateAnchorCitation(identity, 'PENUTUP'),
                text: section.text,
                orderIndex: orderIndex++,
                legalRefs: [],
                tokenEstimate: estimateTokens(section.text),
            });
        }
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

    console.log(`[PMK Naskah] Parsed ${sections.length} sections, ${chunks.length} chunks`);

    return {
        subtype: 'PMK_NASKAH',
        identity,
        sections,
        chunks,
        legalRefs: allLegalRefs,
    };
}
