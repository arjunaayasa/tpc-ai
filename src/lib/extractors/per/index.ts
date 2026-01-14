/**
 * PER Extractor Entry Point
 * Auto-classifies and delegates to appropriate extractor
 */

import { classifyPER } from './perClassifier';
import { parsePERNaskah } from './perNaskahExtractor';
import { parsePERSalindia } from './perSalindiaExtractor';
import { PerSubtype, PerParseResult, perChunkToDbFormat } from './perTypes';

export { classifyPER } from './perClassifier';
export { parsePERNaskah } from './perNaskahExtractor';
export { parsePERSalindia } from './perSalindiaExtractor';
export { perChunkToDbFormat } from './perTypes';
export type { PerSubtype, PerParseResult, PerChunk, PerIdentity } from './perTypes';

/**
 * Parse a PER document with auto-classification
 * @param rawText The raw document text
 * @param subtype Optional override for subtype (skip auto-classification)
 */
export function parsePER(rawText: string, subtype?: PerSubtype): PerParseResult {
    // Determine subtype
    let effectiveSubtype: PerSubtype;

    if (subtype) {
        effectiveSubtype = subtype;
        console.log(`[PER] Using provided subtype: ${subtype}`);
    } else {
        const classification = classifyPER(rawText);
        effectiveSubtype = classification.subtype;
        console.log(`[PER] Auto-classified as: ${effectiveSubtype}`);
    }

    // Delegate to appropriate extractor
    if (effectiveSubtype === 'PER_NASKAH') {
        return parsePERNaskah(rawText);
    } else {
        return parsePERSalindia(rawText);
    }
}
