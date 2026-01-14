/**
 * PER Classifier - Auto-detect PER document subtype
 */

import {
    PER_HEADER_REGEX,
    MENIMBANG_REGEX,
    MENGINGAT_REGEX,
    MEMUTUSKAN_REGEX,
    MENETAPKAN_REGEX,
    PASAL_GLOBAL_REGEX,
    BAB_GLOBAL_REGEX,
    BAGIAN_GLOBAL_REGEX,
    PARAGRAF_GLOBAL_REGEX,
    SALINDIA_HEADING_REGEX,
    ALLCAPS_HEADING_REGEX,
} from './perRegex';
import { PerSubtype } from './perTypes';

interface ClassificationResult {
    subtype: PerSubtype;
    confidence: number;
    reasons: string[];
}

/**
 * Classify a PER document as NASKAH or SALINDIA
 */
export function classifyPER(rawText: string): ClassificationResult {
    const text = rawText.substring(0, 15000); // Check first 15KB for classification

    let naskahScore = 0;
    let salindiaScore = 0;
    const reasons: string[] = [];

    // === NASKAH indicators ===

    // Has PER header
    if (PER_HEADER_REGEX.test(text)) {
        naskahScore += 3;
        reasons.push('Has PER header (+3 naskah)');
    }

    // Has Menimbang
    if (MENIMBANG_REGEX.test(text)) {
        naskahScore += 3;
        reasons.push('Has Menimbang (+3 naskah)');
    }

    // Has Mengingat
    if (MENGINGAT_REGEX.test(text)) {
        naskahScore += 3;
        reasons.push('Has Mengingat (+3 naskah)');
    }

    // Has MEMUTUSKAN or Menetapkan
    if (MEMUTUSKAN_REGEX.test(text) || MENETAPKAN_REGEX.test(text)) {
        naskahScore += 3;
        reasons.push('Has MEMUTUSKAN/Menetapkan (+3 naskah)');
    }

    // Count Pasal occurrences
    const pasalMatches = text.match(PASAL_GLOBAL_REGEX) || [];
    if (pasalMatches.length >= 5) {
        naskahScore += 4;
        reasons.push(`Has ${pasalMatches.length} Pasal occurrences (+4 naskah)`);
    } else if (pasalMatches.length >= 2) {
        naskahScore += 2;
        reasons.push(`Has ${pasalMatches.length} Pasal occurrences (+2 naskah)`);
    }

    // Has BAB structure
    const babMatches = text.match(BAB_GLOBAL_REGEX) || [];
    if (babMatches.length >= 2) {
        naskahScore += 3;
        reasons.push(`Has ${babMatches.length} BAB structures (+3 naskah)`);
    }

    // Has Bagian or Paragraf
    const bagianMatches = text.match(BAGIAN_GLOBAL_REGEX) || [];
    const paragrafMatches = text.match(PARAGRAF_GLOBAL_REGEX) || [];
    if (bagianMatches.length > 0 || paragrafMatches.length > 0) {
        naskahScore += 2;
        reasons.push(`Has Bagian/Paragraf structures (+2 naskah)`);
    }

    // === SALINDIA indicators ===

    // Has slide headings (Overview, Latar Belakang, etc.)
    const slideHeadings = text.match(SALINDIA_HEADING_REGEX) || [];
    if (slideHeadings.length >= 3) {
        salindiaScore += 5;
        reasons.push(`Has ${slideHeadings.length} slide headings (+5 salindia)`);
    } else if (slideHeadings.length >= 1) {
        salindiaScore += 2;
        reasons.push(`Has ${slideHeadings.length} slide headings (+2 salindia)`);
    }

    // Has many all-caps headings (typical for slides)
    const allCapsLines = text.match(ALLCAPS_HEADING_REGEX) || [];
    // Filter out common regulation headers
    const slideStyleCaps = allCapsLines.filter(line =>
        !line.includes('PERATURAN') &&
        !line.includes('DIREKTUR') &&
        !line.includes('MENTERI') &&
        !line.includes('LAMPIRAN') &&
        line.length > 10 && line.length < 60
    );
    if (slideStyleCaps.length >= 5) {
        salindiaScore += 3;
        reasons.push(`Has ${slideStyleCaps.length} all-caps slide lines (+3 salindia)`);
    }

    // No continuous Pasal structure but has Pasal references
    if (pasalMatches.length < 3 && pasalMatches.length > 0) {
        // Check if Pasal mentions are references (contain "PER-" nearby)
        const pasalRefPattern = /Pasal\s+\d+[A-Z]?\s+PER[\s-]*\d+/gi;
        const pasalRefs = text.match(pasalRefPattern) || [];
        if (pasalRefs.length > 0) {
            salindiaScore += 2;
            reasons.push(`Has Pasal references in slide format (+2 salindia)`);
        }
    }

    // Short document with no formal structure
    if (!MENIMBANG_REGEX.test(text) && !MENGINGAT_REGEX.test(text) && pasalMatches.length < 2) {
        salindiaScore += 2;
        reasons.push('No formal regulation structure (+2 salindia)');
    }

    // === Decision ===
    const subtype: PerSubtype = naskahScore >= salindiaScore ? 'PER_NASKAH' : 'PER_SALINDIA';
    const confidence = Math.abs(naskahScore - salindiaScore) / Math.max(naskahScore + salindiaScore, 1);

    console.log(`[PER Classifier] Naskah score: ${naskahScore}, Salindia score: ${salindiaScore}`);
    console.log(`[PER Classifier] Reasons: ${reasons.join(', ')}`);
    console.log(`[PER Classifier] Result: ${subtype}`);

    return {
        subtype,
        confidence: Math.min(confidence, 1),
        reasons,
    };
}
