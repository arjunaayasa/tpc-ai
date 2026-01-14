/**
 * PMK Extractor - Main entry point
 * Routes to NASKAH or PUBLIKASI extractor based on classification
 */

export { classifyPMK, classifyPMKDetailed } from './pmkClassifier';
export { parsePMKNaskah } from './pmkNaskahExtractor';
export { parsePMKPublikasi } from './pmkPublikasiExtractor';
export * from './pmkTypes';
export * from './pmkRegex';

import { classifyPMK } from './pmkClassifier';
import { parsePMKNaskah } from './pmkNaskahExtractor';
import { parsePMKPublikasi } from './pmkPublikasiExtractor';
import { PmkParseResult } from './pmkTypes';

/**
 * Parse PMK document - auto-detects subtype and routes to appropriate extractor
 */
export function parsePMK(rawText: string, forceSubtype?: 'PMK_NASKAH' | 'PMK_PUBLIKASI'): PmkParseResult {
    const subtype = forceSubtype || classifyPMK(rawText);

    console.log(`[PMK] Processing as ${subtype}`);

    if (subtype === 'PMK_NASKAH') {
        return parsePMKNaskah(rawText);
    } else {
        return parsePMKPublikasi(rawText);
    }
}
