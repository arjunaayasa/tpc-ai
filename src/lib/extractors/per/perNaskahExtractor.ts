/**
 * PER Naskah Extractor - Parse official PER regulation text
 * Handles: Header, Menimbang, Mengingat, MEMUTUSKAN, BAB, Bagian, Paragraf, Pasal, Ayat, Lampiran, Penutup
 */

import {
    PER_HEADER_REGEX,
    PER_NOMOR_REGEX,
    TENTANG_REGEX,
    MENIMBANG_REGEX,
    MENGINGAT_REGEX,
    MEMUTUSKAN_REGEX,
    MENETAPKAN_REGEX,
    BAB_GLOBAL_REGEX,
    BAGIAN_GLOBAL_REGEX,
    PARAGRAF_GLOBAL_REGEX,
    LAMPIRAN_REGEX,
    LAMPIRAN_HEADING_REGEX,
    DITETAPKAN_REGEX,
    DIUNDANGKAN_REGEX,
    PAGE_NUMBER_REGEX,
    PAGE_HEADER_REGEX,
    LEGAL_REF_REGEX,
    TANGGAL_TERBIT_REGEX,
    TANGGAL_BERLAKU_REGEX,
} from './perRegex';
import { PerIdentity, PerSection, PerChunk, PerParseResult, PerChunkType } from './perTypes';

// ============== TEXT CLEANING ==============

/**
 * Clean raw text by removing page numbers, headers/footers
 */
export function cleanPERText(rawText: string): string {
    let text = rawText;

    // Normalize whitespace
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');

    // Fix common PDF extraction issues
    text = text.replace(/P\s*a\s*s\s*a\s*l/gi, 'Pasal');
    text = text.replace(/B\s*A\s*B/gi, 'BAB');
    text = text.replace(/A\s*y\s*a\s*t/gi, 'Ayat');
    text = text.replace(/P\s*a\s*r\s*a\s*g\s*r\s*a\s*f/gi, 'Paragraf');
    text = text.replace(/B\s*a\s*g\s*i\s*a\s*n/gi, 'Bagian');
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
 * Extract PER identity (nomor, tahun, tentang)
 */
export function extractPERIdentity(text: string): PerIdentity {
    let nomor: string | null = null;
    let tahun: number | null = null;
    let tentang: string | null = null;
    let tanggalTerbit: string | null = null;
    let tanggalBerlaku: string | null = null;

    // Extract nomor (e.g., "PER-11/PJ/2015")
    const nomorMatch = text.match(PER_NOMOR_REGEX);
    if (nomorMatch) {
        const perNum = nomorMatch[1];
        const perYear = nomorMatch[2];
        nomor = `PER-${perNum}/PJ/${perYear}`;
        tahun = parseInt(perYear, 10);
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
            .substring(0, 500);
    }

    // Extract tanggal terbit
    const terbitMatch = text.match(TANGGAL_TERBIT_REGEX);
    if (terbitMatch) {
        tanggalTerbit = terbitMatch[1]?.trim() || null;
    }

    // Extract tanggal berlaku
    const berlakuMatch = text.match(TANGGAL_BERLAKU_REGEX);
    if (berlakuMatch) {
        tanggalBerlaku = berlakuMatch[1]?.trim() || null;
    }

    return { nomor, tahun, tentang, tanggalTerbit, tanggalBerlaku };
}

// ============== TOKEN ESTIMATION ==============

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

// ============== LEGAL REFERENCE EXTRACTION ==============

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

// ============== ANCHOR CITATION GENERATION ==============

function generateAnchorCitation(
    identity: PerIdentity,
    chunkType: PerChunkType,
    options?: {
        bab?: string;
        bagian?: string;
        paragraf?: string;
        pasal?: string;
        ayat?: string;
        title?: string;
    }
): string {
    const base = identity.nomor ? `PER ${identity.nomor}` : 'PER';

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
        case 'PARAGRAF':
            anchor += ` - Paragraf ${options?.paragraf || ''}`;
            if (options?.title) anchor += ` ${options.title}`;
            break;
        case 'PASAL':
            anchor += ` - Pasal ${options?.pasal || ''}`;
            break;
        case 'AYAT':
            anchor += ` - Pasal ${options?.pasal || ''} Ayat (${options?.ayat || ''})`;
            break;
        case 'LAMPIRAN':
            anchor += ' - LAMPIRAN';
            break;
        case 'LAMPIRAN_SECTION':
            anchor += ` - LAMPIRAN - ${options?.title || ''}`;
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
    type: PerChunkType;
    title: string;
    startIndex: number;
    bab?: string;
    bagian?: string;
    paragraf?: string;
    pasal?: string;
}

/**
 * Find structural boundaries in PER text
 */
function findStructuralBoundaries(text: string): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];

    // Find Menimbang
    const menimbangMatch = text.match(MENIMBANG_REGEX);
    if (menimbangMatch && menimbangMatch.index !== undefined) {
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

    // Find LAMPIRAN
    const lampiranMatch = text.match(LAMPIRAN_REGEX);
    if (lampiranMatch && lampiranMatch.index !== undefined) {
        boundaries.push({
            type: 'LAMPIRAN',
            title: 'Lampiran',
            startIndex: lampiranMatch.index,
        });
    }

    // Find Ditetapkan/Diundangkan (Penutup)
    const ditetapkanMatch = text.match(DITETAPKAN_REGEX);
    const diundangkanMatch = text.match(DIUNDANGKAN_REGEX);
    const penutupIndex = ditetapkanMatch?.index ?? diundangkanMatch?.index;
    if (penutupIndex !== undefined) {
        // Only add if before LAMPIRAN or no LAMPIRAN
        const lampiranIdx = lampiranMatch?.index ?? text.length;
        if (penutupIndex < lampiranIdx) {
            boundaries.push({
                type: 'PENUTUP',
                title: 'Penutup',
                startIndex: penutupIndex,
            });
        }
    }

    // Sort by start index
    boundaries.sort((a, b) => a.startIndex - b.startIndex);

    return boundaries;
}

/**
 * Find Pasal boundaries with reference detection
 */
function findPasalBoundaries(text: string, baseOffset: number): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];
    // Allow leading whitespace for pdfplumber output
    const regex = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/gim;
    const seenPasals = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const pasalNum = match[1].toUpperCase();
        const matchIndex = match.index;

        // Check context before the match to see if it's a reference
        const contextStart = Math.max(0, matchIndex - 50);
        const contextBefore = text.substring(contextStart, matchIndex).toLowerCase();

        const referenceIndicators = [
            'dalam pasal', 'pada pasal', 'sebagaimana dimaksud',
            'dimaksud dalam', 'dimaksud pada', 'menurut pasal',
            'berdasarkan pasal', 'sesuai pasal', 'ketentuan pasal',
            'atau pasal', 'dan pasal', 'sampai dengan pasal',
            'penghasilan pasal', 'huruf'
        ];

        const isReference = referenceIndicators.some(indicator =>
            contextBefore.includes(indicator)
        );

        const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 30);
        const looksLikeHeader = /^\s*(\n|\(1\)|$)/i.test(afterMatch);

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

/**
 * Parse Ayat within a Pasal text
 */
function parseAyatChunks(
    pasalText: string,
    pasalNum: string,
    identity: PerIdentity,
    startOrderIndex: number,
    parentContext: { bab?: string; bagian?: string; paragraf?: string }
): PerChunk[] {
    const ayatChunks: PerChunk[] = [];
    // Allow leading whitespace for pdfplumber output
    const regex = /^\s*\((\d+)\)\s+/gm;

    const matches: { index: number; ayatNum: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(pasalText)) !== null) {
        matches.push({
            index: match.index,
            ayatNum: match[1],
        });
    }

    if (matches.length === 0) {
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
            bab: parentContext.bab,
            bagian: parentContext.bagian,
            paragraf: parentContext.paragraf,
            legalRefs: extractLegalRefs(ayatText),
            tokenEstimate: estimateTokens(ayatText),
        });
    }

    return ayatChunks;
}

/**
 * Find BAB/Bagian/Paragraf boundaries
 */
function findBabBoundaries(text: string, baseOffset: number): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];
    const regex = new RegExp(BAB_GLOBAL_REGEX.source, 'gim');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        boundaries.push({
            type: 'BAB',
            title: match[2]?.trim() || '',
            startIndex: baseOffset + match.index,
            bab: match[1],
        });
    }

    return boundaries;
}

function findBagianBoundaries(text: string, baseOffset: number): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];
    const regex = new RegExp(BAGIAN_GLOBAL_REGEX.source, 'gim');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        boundaries.push({
            type: 'BAGIAN',
            title: match[2]?.trim() || '',
            startIndex: baseOffset + match.index,
            bagian: match[1],
        });
    }

    return boundaries;
}

function findParagrafBoundaries(text: string, baseOffset: number): SectionBoundary[] {
    const boundaries: SectionBoundary[] = [];
    const regex = new RegExp(PARAGRAF_GLOBAL_REGEX.source, 'gim');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        boundaries.push({
            type: 'PARAGRAF',
            title: match[2]?.trim() || '',
            startIndex: baseOffset + match.index,
            paragraf: match[1],
        });
    }

    return boundaries;
}

/**
 * Build chunks from the body section
 */
function buildBodyChunks(
    bodyText: string,
    identity: PerIdentity,
    startOrderIndex: number
): PerChunk[] {
    const chunks: PerChunk[] = [];
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

            // Add BAB chunk
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

                    // Find Paragraf within Bagian
                    const paragrafBoundaries = findParagrafBoundaries(bagianText, 0);

                    if (paragrafBoundaries.length > 0) {
                        for (let p = 0; p < paragrafBoundaries.length; p++) {
                            const paragraf = paragrafBoundaries[p];
                            const nextParagraf = paragrafBoundaries[p + 1];
                            const paragrafEndIndex = nextParagraf ? nextParagraf.startIndex : bagianText.length;
                            const paragrafText = bagianText.substring(paragraf.startIndex, paragrafEndIndex);

                            // Add Paragraf chunk
                            const paragrafHeaderEnd = paragrafText.indexOf('\n\n') !== -1 ? paragrafText.indexOf('\n\n') : paragrafText.indexOf('\n');
                            const paragrafHeaderText = paragrafText.substring(0, paragrafHeaderEnd !== -1 ? paragrafHeaderEnd : 100).trim();

                            chunks.push({
                                chunkType: 'PARAGRAF',
                                title: `Paragraf ${paragraf.paragraf} ${paragraf.title}`.trim(),
                                anchorCitation: generateAnchorCitation(identity, 'PARAGRAF', { paragraf: paragraf.paragraf, title: paragraf.title }),
                                text: paragrafHeaderText,
                                orderIndex: orderIndex++,
                                bab: bab.bab,
                                bagian: bagian.bagian,
                                paragraf: paragraf.paragraf,
                                legalRefs: [],
                                tokenEstimate: estimateTokens(paragrafHeaderText),
                            });

                            // Find Pasal within Paragraf
                            const pasalBoundaries = findPasalBoundaries(paragrafText, 0);
                            for (let k = 0; k < pasalBoundaries.length; k++) {
                                const pasal = pasalBoundaries[k];
                                const nextPasal = pasalBoundaries[k + 1];
                                const pasalEndIndex = nextPasal ? nextPasal.startIndex : paragrafText.length;
                                const pasalText = paragrafText.substring(pasal.startIndex, pasalEndIndex).trim();

                                chunks.push({
                                    chunkType: 'PASAL',
                                    title: `Pasal ${pasal.pasal}`,
                                    anchorCitation: generateAnchorCitation(identity, 'PASAL', { pasal: pasal.pasal }),
                                    text: pasalText,
                                    orderIndex: orderIndex++,
                                    bab: bab.bab,
                                    bagian: bagian.bagian,
                                    paragraf: paragraf.paragraf,
                                    pasal: pasal.pasal,
                                    legalRefs: extractLegalRefs(pasalText),
                                    tokenEstimate: estimateTokens(pasalText),
                                });

                                // Parse Ayat
                                const ayatChunks = parseAyatChunks(pasalText, pasal.pasal!, identity, orderIndex, {
                                    bab: bab.bab,
                                    bagian: bagian.bagian,
                                    paragraf: paragraf.paragraf,
                                });
                                chunks.push(...ayatChunks);
                                orderIndex += ayatChunks.length;
                            }
                        }
                    } else {
                        // No Paragraf, find Pasal directly in Bagian
                        const pasalBoundaries = findPasalBoundaries(bagianText, 0);
                        for (let k = 0; k < pasalBoundaries.length; k++) {
                            const pasal = pasalBoundaries[k];
                            const nextPasal = pasalBoundaries[k + 1];
                            const pasalEndIndex = nextPasal ? nextPasal.startIndex : bagianText.length;
                            const pasalText = bagianText.substring(pasal.startIndex, pasalEndIndex).trim();

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

                            const ayatChunks = parseAyatChunks(pasalText, pasal.pasal!, identity, orderIndex, {
                                bab: bab.bab,
                                bagian: bagian.bagian,
                            });
                            chunks.push(...ayatChunks);
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

                    const ayatChunks = parseAyatChunks(pasalText, pasal.pasal!, identity, orderIndex, {
                        bab: bab.bab,
                    });
                    chunks.push(...ayatChunks);
                    orderIndex += ayatChunks.length;
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

            const ayatChunks = parseAyatChunks(pasalText, pasal.pasal!, identity, orderIndex, {});
            chunks.push(...ayatChunks);
            orderIndex += ayatChunks.length;
        }
    }

    return chunks;
}

/**
 * Parse Lampiran section
 */
function parseLampiranChunks(
    lampiranText: string,
    identity: PerIdentity,
    startOrderIndex: number
): PerChunk[] {
    const chunks: PerChunk[] = [];
    let orderIndex = startOrderIndex;

    // Add main lampiran chunk
    const lampiranHeaderEnd = lampiranText.indexOf('\n\n') !== -1 ? lampiranText.indexOf('\n\n') : 200;
    const lampiranHeader = lampiranText.substring(0, lampiranHeaderEnd).trim();

    chunks.push({
        chunkType: 'LAMPIRAN',
        title: 'LAMPIRAN',
        anchorCitation: generateAnchorCitation(identity, 'LAMPIRAN'),
        text: lampiranHeader,
        orderIndex: orderIndex++,
        legalRefs: [],
        tokenEstimate: estimateTokens(lampiranHeader),
    });

    // Find internal headings
    const headingMatches: { index: number; text: string }[] = [];
    const regex = new RegExp(LAMPIRAN_HEADING_REGEX.source, 'gm');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lampiranText)) !== null) {
        if (match.index > 50) { // Skip first heading (main LAMPIRAN)
            headingMatches.push({
                index: match.index,
                text: match[0].trim(),
            });
        }
    }

    // Create chunks per section
    for (let i = 0; i < headingMatches.length; i++) {
        const current = headingMatches[i];
        const next = headingMatches[i + 1];
        const endIndex = next ? next.index : lampiranText.length;
        const sectionText = lampiranText.substring(current.index, endIndex).trim();

        if (sectionText.length > 50) {
            chunks.push({
                chunkType: 'LAMPIRAN_SECTION',
                title: current.text.substring(0, 100),
                anchorCitation: generateAnchorCitation(identity, 'LAMPIRAN_SECTION', { title: current.text.substring(0, 50) }),
                text: sectionText,
                orderIndex: orderIndex++,
                legalRefs: extractLegalRefs(sectionText),
                tokenEstimate: estimateTokens(sectionText),
            });
        }
    }

    return chunks;
}

// ============== MAIN PARSER ==============

/**
 * Parse a PER NASKAH document into structured sections and chunks
 */
export function parsePERNaskah(rawText: string): PerParseResult {
    // 1. Clean text
    const cleanedText = cleanPERText(rawText);

    // 2. Extract identity
    const identity = extractPERIdentity(cleanedText);
    console.log(`[PER Naskah] Extracted identity: ${JSON.stringify(identity)}`);

    // 3. Find structural boundaries
    const boundaries = findStructuralBoundaries(cleanedText);

    // 4. Build sections
    const sections: PerSection[] = [];
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
    const chunks: PerChunk[] = [];
    let orderIndex = 0;

    for (const section of sections) {
        if (section.type === 'PREAMBLE') {
            chunks.push({
                chunkType: 'PREAMBLE',
                title: 'Header PER',
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
            // Split at first Pasal or BAB - allow leading whitespace for pdfplumber
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

            // Process body
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
        } else if (section.type === 'LAMPIRAN') {
            const lampiranChunks = parseLampiranChunks(section.text, identity, orderIndex);
            chunks.push(...lampiranChunks);
            orderIndex += lampiranChunks.length;
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

    console.log(`[PER Naskah] Parsed ${sections.length} sections, ${chunks.length} chunks`);

    return {
        subtype: 'PER_NASKAH',
        identity,
        sections,
        chunks,
        legalRefs: allLegalRefs,
    };
}
