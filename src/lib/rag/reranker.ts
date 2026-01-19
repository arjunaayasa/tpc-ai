/**
 * Reranker - Uses QWQ-PLUS to rerank chunks by relevance
 * Takes top candidates and returns reordered list
 */

import { callQWQPlus } from './qwenClient';
import { ChunkCandidate, RerankedChunk } from './types';

// ============== PROMPTS ==============

const RERANKER_SYSTEM_PROMPT = `Anda adalah AI Reranker untuk sistem RAG perpajakan Indonesia.
Tugas: Urutkan chunk berdasarkan relevansi dengan pertanyaan user.
Output: JSON array urutan chunkId dari yang paling relevan.`;

function buildRerankerPrompt(question: string, chunks: ChunkCandidate[]): string {
    // Build condensed chunk list
    const chunkList = chunks.slice(0, 50).map((c, i) => ({
        id: c.chunkId,
        idx: i + 1,
        doc: `${c.docType} ${c.docNumber || ''}/${c.docYear || ''}`.trim(),
        anchor: c.anchorCitation,
        excerpt: c.text.substring(0, 200).replace(/\n/g, ' '),
    }));

    return `PERTANYAAN:
"${question}"

KANDIDAT CHUNK (${chunkList.length} item):
${JSON.stringify(chunkList, null, 1)}

TUGAS:
1. Analisis relevansi setiap chunk dengan pertanyaan
2. Urutkan berdasarkan relevansi (paling relevan di atas)
3. Pertimbangkan:
   - Apakah chunk menjawab pertanyaan langsung?
   - Apakah chunk berisi pasal/ayat yang ditanyakan?
   - Apakah chunk dari dokumen yang tepat?

OUTPUT JSON:
{
  "ranked": [
    { "id": "chunk-uuid-1", "score": 0.95 },
    { "id": "chunk-uuid-2", "score": 0.88 },
    ...
  ]
}

Urutkan TOP 25 chunk terbaik. Output JSON saja.`;
}

// ============== MAIN FUNCTION ==============

/**
 * Rerank chunks using QWQ-PLUS
 * @param question User question
 * @param chunks Candidate chunks to rerank
 * @param topK Number of top chunks to return
 */
export async function rerank(
    question: string,
    chunks: ChunkCandidate[],
    topK: number = 25
): Promise<ChunkCandidate[]> {
    console.log(`[Reranker] Reranking ${chunks.length} chunks`);

    if (chunks.length <= topK) {
        // No need to rerank if already small enough
        return chunks;
    }

    try {
        // Take top candidates by preliminary score
        const candidates = chunks
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, Math.min(50, chunks.length));

        const prompt = buildRerankerPrompt(question, candidates);
        const response = await callQWQPlus(prompt, RERANKER_SYSTEM_PROMPT);

        // Parse response
        const parsed = JSON.parse(response) as { ranked: RerankedChunk[] };
        const ranked = parsed.ranked || [];

        console.log(`[Reranker] QWQ-PLUS returned ${ranked.length} ranked items`);

        // Build result by reranked order
        const chunkMap = new Map(candidates.map(c => [c.chunkId, c]));
        const result: ChunkCandidate[] = [];

        for (const item of ranked.slice(0, topK)) {
            // Support both formats: { id, score } or { chunkId, relevanceScore }
            const itemId = (item as any).id || item.chunkId;
            const itemScore = (item as any).score || item.relevanceScore || 0.5;

            const chunk = chunkMap.get(itemId);
            if (chunk) {
                // Update score with reranker score
                result.push({
                    ...chunk,
                    finalScore: itemScore,
                });
            }
        }

        // If reranker returned less than needed, fill with remaining by original score
        if (result.length < topK) {
            const usedIds = new Set(result.map(c => c.chunkId));
            for (const chunk of candidates) {
                if (!usedIds.has(chunk.chunkId)) {
                    result.push(chunk);
                    if (result.length >= topK) break;
                }
            }
        }

        return result;

    } catch (error) {
        console.error('[Reranker] Failed, falling back to original order:', error);
        // Fallback: return top K by original score
        return chunks
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, topK);
    }
}

/**
 * Simple score-based rerank without LLM (faster fallback)
 */
export function scoreBasedRerank(
    chunks: ChunkCandidate[],
    topK: number = 25
): ChunkCandidate[] {
    return chunks
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, topK);
}
