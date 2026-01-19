/**
 * Answer Generator - Uses DeepSeek to generate grounded answers
 * Uses same prompt format as existing chat system for consistency
 * 
 * NOTE: Uses same DeepSeek models as the main chat system (owlie-thinking/owlie-max)
 * NOTE: Uses buildRAGMessages for proper tax rate integration
 */

import { streamChat, ChatMessage, OwlieModel, getModelInfo } from '../chat-service';
import { buildRAGMessages, extractCitationsFromAnswer as extractCitations } from '../prompt';
import { ChunkCandidate, FinalSource, AnswerResult } from './types';
import { ChunkResult } from '../retrieval';

// ============== CONFIG ==============

// Default model for RAG answers (can be overridden)
const DEFAULT_RAG_MODEL: OwlieModel = 'owlie-thinking';

// ============== MAIN FUNCTION ==============

/**
 * Generate final answer using DeepSeek (same as chat system)
 * Uses buildRAGMessages for proper prompt formatting including tax rates
 */
export async function generateAnswer(
    question: string,
    chunks: ChunkCandidate[],
    model: OwlieModel = DEFAULT_RAG_MODEL,
    taxRateContext?: string,
    answerDepth: 'summary' | 'detailed' | 'comprehensive' = 'detailed'
): Promise<AnswerResult> {
    const startTime = Date.now();

    console.log(`[Answer] Generating answer using ${model} from ${chunks.length} chunks`);
    if (taxRateContext) {
        console.log(`[Answer] Tax rate context included (${taxRateContext.length} chars)`);
    }

    // Convert ChunkCandidate to ChunkResult format for buildRAGMessages
    const chunkResults: ChunkResult[] = chunks.map((c, index) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        anchorCitation: c.anchorCitation,
        pasal: c.pasal,
        ayat: c.ayat,
        huruf: c.huruf,
        text: c.text,
        tokenEstimate: c.tokenEstimate,
        similarity: c.finalScore,
        metadata: {
            jenis: c.docType,
            nomor: c.docNumber,
            tahun: c.docYear,
            judul: c.docTitle,
            statusAturan: c.statusAturan,
        },
    }));

    // Use buildRAGMessages - same as existing chat system
    // This properly injects tax rate context with [TR1], [TR2] labels
    const { messages: baseMessages, labeledChunks } = buildRAGMessages(
        question,
        chunkResults,
        'strict',
        taxRateContext,
        answerDepth
    );

    const messages: ChatMessage[] = baseMessages;

    try {
        let fullAnswer = '';
        const modelInfo = getModelInfo(model);

        // Stream the answer
        for await (const chunk of streamChat(model, messages, {
            maxTokens: modelInfo.defaultMaxTokens,
            enableThinking: modelInfo.hasBuiltinThinking,
        })) {
            // Only collect content, skip thinking for final answer
            if (chunk.type === 'content') {
                fullAnswer += chunk.text;
            }
        }

        // Convert labeledChunks to FinalSource format
        const sources = labeledChunks.map((lc, index) => ({
            sid: `S${index + 1}`,
            doc_type: lc.metadata.jenis as FinalSource['doc_type'],
            title: buildSourceTitle(lc),
            anchor: lc.anchorCitation,
            excerpt: lc.text.substring(0, 500),
            chunkId: lc.chunkId,
            documentId: lc.documentId,
        }));

        return {
            answer: fullAnswer,
            sources,
            processingTimeMs: Date.now() - startTime,
        };

    } catch (error) {
        console.error('[Answer] Generation failed:', error);
        return {
            answer: 'Maaf, terjadi kesalahan saat memproses jawaban. Silakan coba lagi.',
            sources: [],
            processingTimeMs: Date.now() - startTime,
        };
    }
}

/**
 * Stream answer generation (for real-time display)
 */
export async function* streamAnswer(
    question: string,
    chunks: ChunkCandidate[],
    model: OwlieModel = DEFAULT_RAG_MODEL,
    taxRateContext?: string,
    answerDepth: 'summary' | 'detailed' | 'comprehensive' = 'detailed'
): AsyncGenerator<{ type: 'content' | 'thinking'; text: string }, AnswerResult, unknown> {
    const startTime = Date.now();

    // Convert ChunkCandidate to ChunkResult format
    const chunkResults: ChunkResult[] = chunks.map((c) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        anchorCitation: c.anchorCitation,
        pasal: c.pasal,
        ayat: c.ayat,
        huruf: c.huruf,
        text: c.text,
        tokenEstimate: c.tokenEstimate,
        similarity: c.finalScore,
        metadata: {
            jenis: c.docType,
            nomor: c.docNumber,
            tahun: c.docYear,
            judul: c.docTitle,
            statusAturan: c.statusAturan,
        },
    }));

    // Use buildRAGMessages with tax rate context and depth
    const { messages, labeledChunks } = buildRAGMessages(
        question,
        chunkResults,
        'strict',
        taxRateContext,
        answerDepth
    );

    let fullAnswer = '';
    const modelInfo = getModelInfo(model);

    try {
        for await (const chunk of streamChat(model, messages, {
            maxTokens: modelInfo.defaultMaxTokens,
            enableThinking: modelInfo.hasBuiltinThinking,
        })) {
            yield chunk;

            if (chunk.type === 'content') {
                fullAnswer += chunk.text;
            }
        }

        // Convert to sources
        const sources = labeledChunks.map((lc, index) => ({
            sid: `S${index + 1}`,
            doc_type: lc.metadata.jenis as FinalSource['doc_type'],
            title: buildSourceTitle(lc),
            anchor: lc.anchorCitation,
            excerpt: lc.text.substring(0, 500),
            chunkId: lc.chunkId,
            documentId: lc.documentId,
        }));

        return {
            answer: fullAnswer,
            sources,
            processingTimeMs: Date.now() - startTime,
        };

    } catch (error) {
        console.error('[Answer] Stream failed:', error);
        return {
            answer: 'Maaf, terjadi kesalahan saat memproses jawaban.',
            sources: [],
            processingTimeMs: Date.now() - startTime,
        };
    }
}

// ============== HELPERS ==============

function buildSourceTitle(chunk: { metadata: { jenis: string; nomor: string | null; tahun: number | null; judul: string | null } }): string {
    const parts: string[] = [];

    parts.push(chunk.metadata.jenis);

    if (chunk.metadata.nomor) {
        parts.push(chunk.metadata.nomor);
    }

    if (chunk.metadata.tahun) {
        parts.push(`Tahun ${chunk.metadata.tahun}`);
    }

    if (chunk.metadata.judul) {
        parts.push(`- ${chunk.metadata.judul.substring(0, 50)}`);
    }

    return parts.join(' ');
}

/**
 * Extract citation references from answer text
 * Returns array of SIDs that were cited
 */
export function extractCitedSources(answer: string): string[] {
    // Support both [Cx] and [Sx] format citations
    const matches = answer.match(/\[(?:C|S)(\d+)\]/g) || [];
    const sids = [...new Set(matches.map(m => m))];
    return sids;
}

/**
 * Build source list for display to user
 */
export function buildSourceListForDisplay(
    sources: FinalSource[],
    citedSids: string[]
): FinalSource[] {
    // Only return sources that were actually cited
    return sources.filter(s => citedSids.includes(`[${s.sid}]`) || citedSids.includes(`[C${s.sid.slice(1)}]`));
}

// Re-export for convenience
export { DEFAULT_RAG_MODEL };
