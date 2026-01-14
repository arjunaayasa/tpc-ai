/**
 * PERPU Extractor - Parse PERPU (Peraturan Pemerintah Pengganti Undang-Undang) documents
 * PERPU has identical structure to UU (Undang-Undang):
 * - BAB → Bagian → Paragraf → Pasal → Ayat → Huruf
 * - PENJELASAN (optional)
 * 
 * This extractor reuses PP parsing logic since PP/PERPU have similar patterns,
 * but generates PERPU-specific anchor citations.
 */

import {
    PERPU_HEADER_REGEX,
    PERPU_NOMOR_REGEX,
    TENTANG_REGEX,
    MENIMBANG_REGEX,
    MENGINGAT_REGEX,
    MEMUTUSKAN_REGEX,
    MENETAPKAN_REGEX,
    BAB_GLOBAL_REGEX,
    BAGIAN_GLOBAL_REGEX,
    PARAGRAF_GLOBAL_REGEX,
    PASAL_GLOBAL_REGEX,
    AYAT_GLOBAL_REGEX,
    AGAR_SETIAP_ORANG_REGEX,
    DITETAPKAN_REGEX,
    PENJELASAN_REGEX,
    PENJELASAN_ATAS_PERPU_REGEX,
    UMUM_REGEX,
    PASAL_DEMI_PASAL_REGEX,
    PENJELASAN_PASAL_GLOBAL_REGEX,
    PENJELASAN_AYAT_GLOBAL_REGEX,
    PAGE_NUMBER_REGEX,
    PAGE_HEADER_REGEX,
    LEGAL_REF_REGEX,
    TANGGAL_DITETAPKAN_REGEX,
    TANGGAL_DIUNDANGKAN_REGEX,
} from './perpuRegex';
import { PerpuIdentity, PerpuSection, PerpuChunk, PerpuParseResult, PerpuChunkType, SourcePart, PerpuStatus } from './perpuTypes';

// ============== TEXT CLEANING ==============

/**
 * Clean raw text by removing page numbers, headers/footers
 */
export function cleanPerpuText(rawText: string): string {
    let text = rawText;

    // Normalize whitespace
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');

    // Fix common PDF extraction issues
    text = text.replace(/P\s*a\s*s\s*a\s*l/gi, 'Pasal');
    text = text.replace(/A\s*y\s*a\s*t/gi, 'Ayat');
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
 * Extract PERPU identity (nomor, tahun, tentang)
 */
export function extractPerpuIdentity(text: string): PerpuIdentity {
    let nomor: string | null = null;
    let tahun: number | null = null;
    let tentang: string | null = null;
    let tanggalDitetapkan: string | null = null;
    let tanggalDiundangkan: string | null = null;
    const status: PerpuStatus = 'BERLAKU'; // Default status

    // Extract nomor and tahun
    const nomorMatch = text.match(PERPU_NOMOR_REGEX);
    if (nomorMatch) {
        nomor = nomorMatch[1];
        tahun = parseInt(nomorMatch[2], 10);
    }

    // If year not found, look in first 2000 chars
    if (!tahun) {
        const header = text.substring(0, 2000);
        const yearPatterns = [
            /TAHUN\s+(\d{4})/i,
            /\b(20[0-2]\d)\b/,
        ];
        for (const pattern of yearPatterns) {
            const match = header.match(pattern);
            if (match) {
                const year = parseInt(match[1], 10);
                if (year >= 1990 && year <= 2100) {
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

    // Extract tanggal ditetapkan
    const ditetapkanMatch = text.match(TANGGAL_DITETAPKAN_REGEX);
    if (ditetapkanMatch) {
        tanggalDitetapkan = ditetapkanMatch[1]?.trim() || null;
    }

    // Extract tanggal diundangkan
    const diundangkanMatch = text.match(TANGGAL_DIUNDANGKAN_REGEX);
    if (diundangkanMatch) {
        tanggalDiundangkan = diundangkanMatch[1]?.trim() || null;
    }

    return { nomor, tahun, tentang, tanggalDitetapkan, tanggalDiundangkan, status };
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
    identity: PerpuIdentity,
    chunkType: PerpuChunkType,
    sourcePart: SourcePart,
    options?: { bab?: string; bagian?: string; paragraf?: string; pasal?: string; ayat?: string }
): string {
    const base = identity.nomor && identity.tahun
        ? `PERPU ${identity.nomor}/${identity.tahun}`
        : 'PERPU';

    let anchor = base;

    switch (chunkType) {
        case 'PREAMBLE':
            anchor += ' - HEADER';
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
            break;
        case 'BAGIAN':
            anchor += ` - BAB ${options?.bab || ''} - Bagian ${options?.bagian || ''}`;
            break;
        case 'PASAL':
            anchor += ` - ${sourcePart} - Pasal ${options?.pasal || ''}`;
            break;
        case 'AYAT':
            anchor += ` - ${sourcePart} - Pasal ${options?.pasal || ''} Ayat (${options?.ayat || ''})`;
            break;
        case 'PENUTUP':
            anchor += ' - PENUTUP';
            break;
        case 'PENJELASAN_UMUM':
            anchor += ' - PENJELASAN - UMUM';
            break;
        case 'PENJELASAN_PASAL':
            anchor += ` - PENJELASAN - Pasal ${options?.pasal || ''}`;
            break;
        case 'PENJELASAN_AYAT':
            anchor += ` - PENJELASAN - Pasal ${options?.pasal || ''} Ayat (${options?.ayat || ''})`;
            break;
        default:
            anchor += ` - ${chunkType}`;
    }

    return anchor;
}

// ============== SPLIT BATANG TUBUH / PENJELASAN ==============

interface DocumentParts {
    batangTubuh: string;
    penjelasan: string | null;
    penjelasanStartIndex: number;
}

/**
 * Split document into BATANG_TUBUH and PENJELASAN parts
 */
function splitBatangTubuhPenjelasan(text: string): DocumentParts {
    // Look for PENJELASAN header (PERPU-specific first, then generic)
    const penjelasanMatch = text.match(PENJELASAN_ATAS_PERPU_REGEX) || text.match(PENJELASAN_REGEX);

    if (penjelasanMatch && penjelasanMatch.index !== undefined) {
        return {
            batangTubuh: text.substring(0, penjelasanMatch.index).trim(),
            penjelasan: text.substring(penjelasanMatch.index).trim(),
            penjelasanStartIndex: penjelasanMatch.index,
        };
    }

    return {
        batangTubuh: text,
        penjelasan: null,
        penjelasanStartIndex: text.length,
    };
}

// ============== PASAL/AYAT PARSING ==============

interface PasalBoundary {
    pasal: string;
    startIndex: number;
}

function findPasalBoundaries(text: string): PasalBoundary[] {
    const boundaries: PasalBoundary[] = [];
    const regex = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/gim;
    const seenPasals = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const pasalNum = match[1].toUpperCase();
        const matchIndex = match.index;

        // Check context before the match to exclude references
        const contextStart = Math.max(0, matchIndex - 50);
        const contextBefore = text.substring(contextStart, matchIndex).toLowerCase();

        const referenceIndicators = [
            'dalam pasal', 'pada pasal', 'sebagaimana dimaksud',
            'dimaksud dalam', 'dimaksud pada', 'ketentuan pasal',
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
                    pasal: pasalNum,
                    startIndex: matchIndex,
                });
            }
        }
    }

    return boundaries;
}

function parseAyatChunks(
    pasalText: string,
    pasalNum: string,
    identity: PerpuIdentity,
    sourcePart: SourcePart,
    startOrderIndex: number
): PerpuChunk[] {
    const ayatChunks: PerpuChunk[] = [];
    const regex = /^\((\d+)\)\s+/gm;

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
            anchorCitation: generateAnchorCitation(identity, 'AYAT', sourcePart, { pasal: pasalNum, ayat: current.ayatNum }),
            text: ayatText,
            orderIndex: orderIndex++,
            sourcePart,
            pasal: pasalNum,
            ayat: current.ayatNum,
            legalRefs: extractLegalRefs(ayatText),
            tokenEstimate: estimateTokens(ayatText),
        });
    }

    return ayatChunks;
}

// ============== PARSE BATANG TUBUH ==============

function parseBatangTubuh(
    text: string,
    identity: PerpuIdentity,
    startOrderIndex: number
): PerpuChunk[] {
    const chunks: PerpuChunk[] = [];
    let orderIndex = startOrderIndex;
    const sourcePart: SourcePart = 'BATANG_TUBUH';

    // Find structural boundaries
    const menimbangMatch = text.match(MENIMBANG_REGEX);
    const mengingatMatch = text.match(MENGINGAT_REGEX);
    const memutuskanMatch = text.match(MEMUTUSKAN_REGEX);
    const menetapkanMatch = text.match(MENETAPKAN_REGEX);
    const agarMatch = text.match(AGAR_SETIAP_ORANG_REGEX);
    const ditetapkanMatch = text.match(DITETAPKAN_REGEX);

    // 1. HEADER/PREAMBLE (before Menimbang)
    const headerEnd = menimbangMatch?.index ?? mengingatMatch?.index ?? 0;
    if (headerEnd > 0) {
        const headerText = text.substring(0, headerEnd).trim();
        if (headerText.length > 50) {
            chunks.push({
                chunkType: 'PREAMBLE',
                title: 'Header PERPU',
                anchorCitation: generateAnchorCitation(identity, 'PREAMBLE', sourcePart),
                text: headerText,
                orderIndex: orderIndex++,
                sourcePart,
                legalRefs: [],
                tokenEstimate: estimateTokens(headerText),
            });
        }
    }

    // 2. MENIMBANG
    if (menimbangMatch && menimbangMatch.index !== undefined) {
        const end = mengingatMatch?.index ?? memutuskanMatch?.index ?? menetapkanMatch?.index ?? text.length;
        const menimbangText = text.substring(menimbangMatch.index, end).trim();
        chunks.push({
            chunkType: 'MENIMBANG',
            title: 'Menimbang',
            anchorCitation: generateAnchorCitation(identity, 'MENIMBANG', sourcePart),
            text: menimbangText,
            orderIndex: orderIndex++,
            sourcePart,
            legalRefs: [],
            tokenEstimate: estimateTokens(menimbangText),
        });
    }

    // 3. MENGINGAT
    if (mengingatMatch && mengingatMatch.index !== undefined) {
        const end = memutuskanMatch?.index ?? menetapkanMatch?.index ?? text.length;
        const mengingatText = text.substring(mengingatMatch.index, end).trim();
        chunks.push({
            chunkType: 'MENGINGAT',
            title: 'Mengingat',
            anchorCitation: generateAnchorCitation(identity, 'MENGINGAT', sourcePart),
            text: mengingatText,
            orderIndex: orderIndex++,
            sourcePart,
            legalRefs: extractLegalRefs(mengingatText),
            tokenEstimate: estimateTokens(mengingatText),
        });
    }

    // 4. PENETAPAN (MEMUTUSKAN/Menetapkan until first Pasal)
    const penetapanStart = memutuskanMatch?.index ?? menetapkanMatch?.index;
    if (penetapanStart !== undefined) {
        const pasalBoundaries = findPasalBoundaries(text);
        const firstPasalIndex = pasalBoundaries.length > 0 ? pasalBoundaries[0].startIndex : text.length;
        const penetapanEnd = Math.min(firstPasalIndex, agarMatch?.index ?? text.length, ditetapkanMatch?.index ?? text.length);

        const penetapanText = text.substring(penetapanStart, penetapanEnd).trim();
        if (penetapanText.length > 20) {
            chunks.push({
                chunkType: 'PENETAPAN',
                title: 'Menetapkan',
                anchorCitation: generateAnchorCitation(identity, 'PENETAPAN', sourcePart),
                text: penetapanText,
                orderIndex: orderIndex++,
                sourcePart,
                legalRefs: [],
                tokenEstimate: estimateTokens(penetapanText),
            });
        }
    }

    // 5. PASAL -> AYAT
    const pasalBoundaries = findPasalBoundaries(text);
    const penutupStart = agarMatch?.index ?? ditetapkanMatch?.index ?? text.length;

    for (let i = 0; i < pasalBoundaries.length; i++) {
        const pasal = pasalBoundaries[i];
        const nextPasal = pasalBoundaries[i + 1];
        const pasalEndIndex = nextPasal ? nextPasal.startIndex : penutupStart;
        const pasalText = text.substring(pasal.startIndex, pasalEndIndex).trim();

        // Add Pasal chunk
        chunks.push({
            chunkType: 'PASAL',
            title: `Pasal ${pasal.pasal}`,
            anchorCitation: generateAnchorCitation(identity, 'PASAL', sourcePart, { pasal: pasal.pasal }),
            text: pasalText,
            orderIndex: orderIndex++,
            sourcePart,
            pasal: pasal.pasal,
            legalRefs: extractLegalRefs(pasalText),
            tokenEstimate: estimateTokens(pasalText),
        });

        // Parse Ayat within Pasal
        const ayatChunks = parseAyatChunks(pasalText, pasal.pasal, identity, sourcePart, orderIndex);
        chunks.push(...ayatChunks);
        orderIndex += ayatChunks.length;
    }

    // 6. PENUTUP
    if (penutupStart < text.length) {
        const penutupText = text.substring(penutupStart).trim();
        if (penutupText.length > 50) {
            chunks.push({
                chunkType: 'PENUTUP',
                title: 'Penutup',
                anchorCitation: generateAnchorCitation(identity, 'PENUTUP', sourcePart),
                text: penutupText,
                orderIndex: orderIndex++,
                sourcePart,
                legalRefs: [],
                tokenEstimate: estimateTokens(penutupText),
            });
        }
    }

    return chunks;
}

// ============== PARSE PENJELASAN ==============

function parsePenjelasan(
    text: string,
    identity: PerpuIdentity,
    startOrderIndex: number
): PerpuChunk[] {
    const chunks: PerpuChunk[] = [];
    let orderIndex = startOrderIndex;
    const sourcePart: SourcePart = 'PENJELASAN';

    // Find I. UMUM and II. PASAL DEMI PASAL
    const umumMatch = text.match(UMUM_REGEX);
    const pasalDemiPasalMatch = text.match(PASAL_DEMI_PASAL_REGEX);

    // 1. PENJELASAN UMUM
    if (umumMatch && umumMatch.index !== undefined) {
        const umumEnd = pasalDemiPasalMatch?.index ?? text.length;
        const umumText = text.substring(umumMatch.index, umumEnd).trim();

        if (umumText.length > 50) {
            chunks.push({
                chunkType: 'PENJELASAN_UMUM',
                title: 'Penjelasan Umum',
                anchorCitation: generateAnchorCitation(identity, 'PENJELASAN_UMUM', sourcePart),
                text: umumText,
                orderIndex: orderIndex++,
                sourcePart,
                legalRefs: extractLegalRefs(umumText),
                tokenEstimate: estimateTokens(umumText),
            });
        }
    }

    // 2. PASAL DEMI PASAL
    if (pasalDemiPasalMatch && pasalDemiPasalMatch.index !== undefined) {
        const pasalDemiPasalText = text.substring(pasalDemiPasalMatch.index);

        // Find Pasal boundaries within Pasal Demi Pasal section
        const regex = new RegExp(PENJELASAN_PASAL_GLOBAL_REGEX.source, 'gim');
        const pasalMatches: { pasal: string; index: number }[] = [];
        let match: RegExpExecArray | null;

        while ((match = regex.exec(pasalDemiPasalText)) !== null) {
            pasalMatches.push({
                pasal: match[1].toUpperCase(),
                index: match.index,
            });
        }

        // Create chunks for each Pasal explanation
        for (let i = 0; i < pasalMatches.length; i++) {
            const current = pasalMatches[i];
            const next = pasalMatches[i + 1];
            const endIndex = next ? next.index : pasalDemiPasalText.length;
            const pasalText = pasalDemiPasalText.substring(current.index, endIndex).trim();

            if (pasalText.length > 20) {
                chunks.push({
                    chunkType: 'PENJELASAN_PASAL',
                    title: `Penjelasan Pasal ${current.pasal}`,
                    anchorCitation: generateAnchorCitation(identity, 'PENJELASAN_PASAL', sourcePart, { pasal: current.pasal }),
                    text: pasalText,
                    orderIndex: orderIndex++,
                    sourcePart,
                    pasal: current.pasal,
                    legalRefs: extractLegalRefs(pasalText),
                    tokenEstimate: estimateTokens(pasalText),
                });

                // Parse Ayat explanations within Pasal explanation
                const ayatRegex = new RegExp(PENJELASAN_AYAT_GLOBAL_REGEX.source, 'gim');
                const ayatMatches: { ayat: string; index: number }[] = [];
                let ayatMatch: RegExpExecArray | null;

                while ((ayatMatch = ayatRegex.exec(pasalText)) !== null) {
                    ayatMatches.push({
                        ayat: ayatMatch[1],
                        index: ayatMatch.index,
                    });
                }

                for (let j = 0; j < ayatMatches.length; j++) {
                    const ayatCurrent = ayatMatches[j];
                    const ayatNext = ayatMatches[j + 1];
                    const ayatEndIndex = ayatNext ? ayatNext.index : pasalText.length;
                    const ayatText = pasalText.substring(ayatCurrent.index, ayatEndIndex).trim();

                    if (ayatText.length > 20) {
                        chunks.push({
                            chunkType: 'PENJELASAN_AYAT',
                            title: `Penjelasan Pasal ${current.pasal} Ayat (${ayatCurrent.ayat})`,
                            anchorCitation: generateAnchorCitation(identity, 'PENJELASAN_AYAT', sourcePart, { pasal: current.pasal, ayat: ayatCurrent.ayat }),
                            text: ayatText,
                            orderIndex: orderIndex++,
                            sourcePart,
                            pasal: current.pasal,
                            ayat: ayatCurrent.ayat,
                            legalRefs: extractLegalRefs(ayatText),
                            tokenEstimate: estimateTokens(ayatText),
                        });
                    }
                }
            }
        }
    }

    return chunks;
}

// ============== MAIN PARSER ==============

/**
 * Parse a PERPU document into structured sections and chunks
 */
export function parsePerpu(rawText: string): PerpuParseResult {
    // 1. Clean text
    const cleanedText = cleanPerpuText(rawText);

    // 2. Extract identity
    const identity = extractPerpuIdentity(cleanedText);
    console.log(`[PERPU] Extracted identity: ${JSON.stringify(identity)}`);

    // 3. Split into BATANG_TUBUH and PENJELASAN
    const { batangTubuh, penjelasan } = splitBatangTubuhPenjelasan(cleanedText);
    console.log(`[PERPU] BATANG_TUBUH: ${batangTubuh.length} chars, PENJELASAN: ${penjelasan?.length || 0} chars`);

    // 4. Parse BATANG_TUBUH
    const batangTubuhChunks = parseBatangTubuh(batangTubuh, identity, 0);
    console.log(`[PERPU] Parsed ${batangTubuhChunks.length} BATANG_TUBUH chunks`);

    // 5. Parse PENJELASAN (if exists)
    let penjelasanChunks: PerpuChunk[] = [];
    if (penjelasan) {
        penjelasanChunks = parsePenjelasan(penjelasan, identity, batangTubuhChunks.length);
        console.log(`[PERPU] Parsed ${penjelasanChunks.length} PENJELASAN chunks`);
    }

    // 6. Combine all chunks
    const allChunks = [...batangTubuhChunks, ...penjelasanChunks];

    // 7. Build sections (simplified)
    const sections: PerpuSection[] = [];

    // 8. Collect all legal refs
    const allLegalRefs: string[] = [];
    for (const chunk of allChunks) {
        if (chunk.legalRefs) {
            for (const ref of chunk.legalRefs) {
                if (!allLegalRefs.includes(ref)) {
                    allLegalRefs.push(ref);
                }
            }
        }
    }

    console.log(`[PERPU] Total chunks: ${allChunks.length}`);

    return {
        identity,
        sections,
        chunks: allChunks,
        legalRefs: allLegalRefs,
    };
}
