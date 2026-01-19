/**
 * Sufficiency Check - Uses QWQ-PLUS to evaluate if context is complete
 * Determines if additional retrieval is needed
 */

import { callQWQPlus } from './qwenClient';
import { ChunkCandidate, SufficiencyResult, AdditionalRetrievalRequest } from './types';

// ============== PROMPTS ==============

const SUFFICIENCY_SYSTEM_PROMPT = `Anda adalah AI Sufficiency Judge untuk sistem RAG perpajakan Indonesia.
Tugas: Evaluasi apakah konteks yang tersedia sudah cukup untuk menjawab pertanyaan.
Output: JSON dengan penilaian dan rekomendasi.`;

function buildSufficiencyPrompt(question: string, chunks: ChunkCandidate[]): string {
    // Build condensed chunk summary
    const chunkSummary = chunks.slice(0, 25).map((c, i) => ({
        idx: i + 1,
        doc: `${c.docType} ${c.docNumber || ''}/${c.docYear || ''}`.trim(),
        anchor: c.anchorCitation,
        type: c.chunkType,
        excerpt: c.text.substring(0, 150).replace(/\n/g, ' '),
    }));

    return `PERTANYAAN:
"${question}"

KONTEKS TERSEDIA (${chunkSummary.length} chunk):
${JSON.stringify(chunkSummary, null, 1)}

TUGAS EVALUASI:
1. Apakah konteks cukup untuk menjawab pertanyaan USER?
2. Informasi apa yang KURANG?
3. Apakah perlu ekspansi (parent pasal, siblings, penjelasan)?
4. Apakah perlu retrieval tambahan?

OUTPUT JSON:
{
  "sufficient": true | false,
  "missing": ["info yang kurang 1", "info yang kurang 2"],
  "expansion": {
    "expand_parent": boolean,
    "expand_siblings_window": 0 | 1 | 2,
    "expand_penjelasan_for_same_pasal": boolean
  },
  "additional_requests": [
    {
      "query": "query retrieval tambahan",
      "doc_type_priority": ["PMK", "PER"],
      "must_include_terms": ["term1"],
      "focus_chunk_types": ["PASAL", "AYAT"],
      "top_k": 10
    }
  ]
}

RULES:
- sufficient = true jika 70%+ informasi sudah ada
- additional_requests maksimal 2 item
- Jika pertanyaan tentang definisi tapi tidak ada PENJELASAN → expand_penjelasan = true
- Jika ayat ada tapi pasal tidak ada → expand_parent = true

Jawab HANYA dengan JSON, tanpa penjelasan tambahan.`;
}

// ============== MAIN FUNCTION ==============

/**
 * Check if retrieved context is sufficient to answer the question
 */
export async function checkSufficiency(
    question: string,
    chunks: ChunkCandidate[]
): Promise<SufficiencyResult> {
    console.log(`[Sufficiency] Checking ${chunks.length} chunks`);

    // Quick sufficiency check based on chunk count and diversity
    const quickCheck = performQuickCheck(chunks);
    if (quickCheck.definitelySufficient) {
        console.log('[Sufficiency] Quick check: sufficient');
        return {
            sufficient: true,
            missing: [],
            expansion: {
                expand_parent: false,
                expand_siblings_window: 0,
                expand_penjelasan_for_same_pasal: false,
            },
            additional_requests: [],
        };
    }

    try {
        const prompt = buildSufficiencyPrompt(question, chunks);
        const response = await callQWQPlus(prompt, SUFFICIENCY_SYSTEM_PROMPT);

        const result = JSON.parse(response) as SufficiencyResult;

        // Validate and cap additional requests
        result.additional_requests = (result.additional_requests || []).slice(0, 2);

        // Validate expansion
        result.expansion = {
            expand_parent: result.expansion?.expand_parent || false,
            expand_siblings_window: Math.min(result.expansion?.expand_siblings_window || 0, 2) as 0 | 1 | 2,
            expand_penjelasan_for_same_pasal: result.expansion?.expand_penjelasan_for_same_pasal || false,
        };

        console.log(`[Sufficiency] Result: sufficient=${result.sufficient}, missing=${result.missing.length}, additional_requests=${result.additional_requests.length}`);

        return result;

    } catch (error) {
        console.error('[Sufficiency] Failed, assuming sufficient:', error);
        // Default to sufficient to avoid infinite loops
        return {
            sufficient: true,
            missing: [],
            expansion: {
                expand_parent: false,
                expand_siblings_window: 0,
                expand_penjelasan_for_same_pasal: false,
            },
            additional_requests: [],
        };
    }
}

// ============== QUICK CHECK ==============

interface QuickCheckResult {
    definitelySufficient: boolean;
    needsDeepCheck: boolean;
}

function performQuickCheck(chunks: ChunkCandidate[]): QuickCheckResult {
    // If we have good number of high-quality chunks, likely sufficient
    const highScoreChunks = chunks.filter(c => c.finalScore > 0.7);
    const uniqueDocs = new Set(chunks.map(c => c.documentId)).size;

    // Definitely sufficient if:
    // - 15+ chunks with good scores
    // - 5+ unique documents
    if (highScoreChunks.length >= 15 && uniqueDocs >= 5) {
        return { definitelySufficient: true, needsDeepCheck: false };
    }

    // Check if we have key chunk types
    const hasPassal = chunks.some(c => c.chunkType === 'PASAL');
    const hasPenjelasan = chunks.some(c => c.chunkType.startsWith('PENJELASAN'));

    if (chunks.length >= 10 && hasPassal && uniqueDocs >= 3) {
        return { definitelySufficient: true, needsDeepCheck: false };
    }

    return { definitelySufficient: false, needsDeepCheck: true };
}

/**
 * Create additional retrieval request based on missing info
 */
export function createAdditionalRequest(
    missing: string,
    originalPlan: { doc_type_priority: string[] }
): AdditionalRetrievalRequest {
    return {
        query: missing,
        doc_type_priority: originalPlan.doc_type_priority.slice(0, 3) as any,
        must_include_terms: [],
        focus_chunk_types: ['PASAL', 'AYAT', 'PENJELASAN_PASAL'],
        top_k: 10,
    };
}
