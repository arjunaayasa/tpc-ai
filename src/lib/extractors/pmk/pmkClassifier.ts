/**
 * PMK Classifier - Classifies PMK documents as NASKAH or PUBLIKASI
 */

import {
    PMK_HEADER_REGEX,
    SALINAN_REGEX,
    MENIMBANG_REGEX,
    MENGINGAT_REGEX,
    MEMUTUSKAN_REGEX,
    MENETAPKAN_REGEX,
    PASAL_GLOBAL_REGEX,
    BERITA_NEGARA_REGEX,
    DITETAPKAN_REGEX,
    HEADING_PATTERNS,
    PAJAK_GO_ID_REGEX,
} from './pmkRegex';
import { PmkSubtype } from './pmkTypes';

interface ClassificationScore {
    naskahScore: number;
    publikasiScore: number;
    reasons: string[];
}

/**
 * Classify a PMK document as either NASKAH (regulatory text) or PUBLIKASI (socialization material)
 * 
 * @param rawText - The full text of the PMK document
 * @returns 'PMK_NASKAH' or 'PMK_PUBLIKASI'
 */
export function classifyPMK(rawText: string): PmkSubtype {
    const score = calculateClassificationScore(rawText);

    console.log(`[PMK Classifier] Naskah score: ${score.naskahScore}, Publikasi score: ${score.publikasiScore}`);
    console.log(`[PMK Classifier] Reasons: ${score.reasons.join(', ')}`);

    return score.naskahScore > score.publikasiScore ? 'PMK_NASKAH' : 'PMK_PUBLIKASI';
}

/**
 * Calculate classification scores with detailed reasoning
 */
function calculateClassificationScore(text: string): ClassificationScore {
    let naskahScore = 0;
    let publikasiScore = 0;
    const reasons: string[] = [];

    // ============== NASKAH INDICATORS ==============

    // 1. Has "PERATURAN MENTERI KEUANGAN" header
    if (PMK_HEADER_REGEX.test(text)) {
        naskahScore += 3;
        reasons.push('Has PMK header (+3 naskah)');
    }

    // 2. Has "SALINAN" header
    if (SALINAN_REGEX.test(text)) {
        naskahScore += 2;
        reasons.push('Has SALINAN header (+2 naskah)');
    }

    // 3. Has Menimbang AND Mengingat
    const hasMenimbang = MENIMBANG_REGEX.test(text);
    const hasMengingat = MENGINGAT_REGEX.test(text);
    if (hasMenimbang && hasMengingat) {
        naskahScore += 4;
        reasons.push('Has Menimbang AND Mengingat (+4 naskah)');
    }

    // 4. Has MEMUTUSKAN or Menetapkan
    if (MEMUTUSKAN_REGEX.test(text) || MENETAPKAN_REGEX.test(text)) {
        naskahScore += 3;
        reasons.push('Has MEMUTUSKAN/Menetapkan (+3 naskah)');
    }

    // 5. Count Pasal occurrences
    const pasalMatches = text.match(PASAL_GLOBAL_REGEX);
    const pasalCount = pasalMatches ? pasalMatches.length : 0;
    if (pasalCount > 10) {
        naskahScore += 4;
        reasons.push(`Has ${pasalCount} Pasal occurrences (+4 naskah)`);
    } else if (pasalCount > 3) {
        naskahScore += 2;
        reasons.push(`Has ${pasalCount} Pasal occurrences (+2 naskah)`);
    } else if (pasalCount > 0) {
        naskahScore += 1;
        reasons.push(`Has ${pasalCount} Pasal occurrences (+1 naskah)`);
    }

    // 6. Has "Ditetapkan di" (official closing)
    if (DITETAPKAN_REGEX.test(text)) {
        naskahScore += 2;
        reasons.push('Has "Ditetapkan di" (+2 naskah)');
    }

    // 7. Has "BERITA NEGARA"
    if (BERITA_NEGARA_REGEX.test(text)) {
        naskahScore += 2;
        reasons.push('Has BERITA NEGARA (+2 naskah)');
    }

    // ============== PUBLIKASI INDICATORS ==============

    // 1. Has heading patterns (LATAR BELAKANG, TUJUAN, etc.)
    let headingCount = 0;
    for (const pattern of HEADING_PATTERNS) {
        if (pattern.test(text)) {
            headingCount++;
        }
    }
    if (headingCount >= 3) {
        publikasiScore += 5;
        reasons.push(`Has ${headingCount} publication headings (+5 publikasi)`);
    } else if (headingCount >= 2) {
        publikasiScore += 3;
        reasons.push(`Has ${headingCount} publication headings (+3 publikasi)`);
    } else if (headingCount >= 1) {
        publikasiScore += 1;
        reasons.push(`Has ${headingCount} publication heading (+1 publikasi)`);
    }

    // 2. Has pajak.go.id or web references
    if (PAJAK_GO_ID_REGEX.test(text)) {
        publikasiScore += 2;
        reasons.push('Has pajak.go.id reference (+2 publikasi)');
    }

    // 3. Low Pasal count with heading patterns
    if (pasalCount < 3 && headingCount >= 2) {
        publikasiScore += 3;
        reasons.push('Low Pasal count with headings (+3 publikasi)');
    }

    // 4. Check for bullet-heavy content (common in slides)
    const bulletLines = text.match(/^[\s]*[-•●○]\s+/gm);
    const bulletCount = bulletLines ? bulletLines.length : 0;
    if (bulletCount > 20) {
        publikasiScore += 2;
        reasons.push(`High bullet count: ${bulletCount} (+2 publikasi)`);
    }

    // 5. Contains "Direktorat Jenderal Pajak" prominently (common in publikasi materials)
    const djpCount = (text.match(/Direktorat\s+Jenderal\s+Pajak/gi) || []).length;
    if (djpCount >= 3) {
        publikasiScore += 1;
        reasons.push(`DJP mentioned ${djpCount} times (+1 publikasi)`);
    }

    return { naskahScore, publikasiScore, reasons };
}

/**
 * Get detailed classification result with scores and reasoning
 */
export function classifyPMKDetailed(rawText: string): {
    subtype: PmkSubtype;
    score: ClassificationScore;
} {
    const score = calculateClassificationScore(rawText);
    return {
        subtype: score.naskahScore > score.publikasiScore ? 'PMK_NASKAH' : 'PMK_PUBLIKASI',
        score,
    };
}
