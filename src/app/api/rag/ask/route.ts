/**
 * RAG Ask API endpoint
 * POST /api/rag/ask
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { retrieve, RetrievalFilters } from '@/lib/retrieval';
import { chat, checkOllamaHealth } from '@/lib/ollama';
import {
    buildRAGMessages,
    extractCitationsFromAnswer,
    buildCitationList,
    AnswerMode
} from '@/lib/prompt';
import { getTaxRateContextForQuestion } from '@/lib/tax/taxRateContext';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for LLM response

// Request validation schema
const askRequestSchema = z.object({
    question: z.string().min(3, 'Pertanyaan minimal 3 karakter').max(2000),
    topK: z.number().int().min(1).max(50).default(12),
    filters: z.object({
        jenis: z.enum(['UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'UNKNOWN']).optional(),
        nomor: z.string().optional(),
        tahun: z.number().int().min(1900).max(2100).optional(),
        pasal: z.string().optional(),
        statusAturan: z.enum(['berlaku', 'diubah', 'dicabut', 'unknown']).optional(),
        documentId: z.string().uuid().optional(),
    }).optional(),
    mode: z.enum(['strict', 'balanced']).default('strict'),
    enableThinking: z.boolean().default(false),  // Enable chain-of-thought reasoning
});

// Response types
interface Citation {
    label: string;
    chunkId: string;
    anchorCitation: string;
    documentId: string;
    jenis: string;
    nomor: string | null;
    tahun: number | null;
}

interface ChunkUsed {
    id: string;
    anchorCitation: string;
    textExcerpt: string;
    similarity: number;
}

interface AskResponse {
    answer: string;
    citations: Citation[];
    chunksUsed: ChunkUsed[];
    metadata: {
        question: string;
        topK: number;
        mode: AnswerMode;
        chunksRetrieved: number;
        processingTimeMs: number;
    };
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        // 1. Parse and validate request
        const body = await request.json();
        const parseResult = askRequestSchema.safeParse(body);

        if (!parseResult.success) {
            return NextResponse.json(
                {
                    error: 'Invalid request',
                    details: parseResult.error.flatten()
                },
                { status: 400 }
            );
        }

        const { question, topK, filters, mode, enableThinking } = parseResult.data;

        // 2. Check if this is a conversational/greeting message (skip RAG but use AI)
        const conversationalPatterns = [
            /^(halo|hai|hi|hello|hey|selamat\s*(pagi|siang|sore|malam))/i,
            /^(apa\s*kabar|siapa\s*(kamu|anda|nama\s*mu))/i,
            /^(terima\s*kasih|makasih|thanks|thank\s*you)/i,
            /^(bye|dadah|sampai\s*jumpa)/i,
            /^(tolong|bantu|help)$/i,
        ];

        const isConversational = conversationalPatterns.some(pattern => pattern.test(question.trim()));

        if (isConversational) {
            // Use AI for conversational response (no RAG context needed)
            console.log('[RAG] Conversational message detected, using AI without RAG');

            const conversationalMessages = [
                {
                    role: 'system' as const,
                    content: `Kamu adalah TPC AI, asisten perpajakan Indonesia yang ramah dan helpful.
                    
Saat ini user sedang berbicara casual/ngobrol biasa. Responlah dengan ramah dan natural.

Tentang dirimu:
- Nama: TPC AI
- Spesialisasi: Peraturan perpajakan Indonesia (UU PPh, UU PPN, PMK, dll)
- Kemampuan: Menjawab pertanyaan tentang tarif pajak, objek pajak, PTKP, dan regulasi perpajakan
- Kepribadian: Ramah, profesional, helpful

Jika user menyapa, balas dengan ramah dan tawarkan bantuan tentang perpajakan.
Jika user mengucapkan terima kasih, balas dengan sopan.
Jika user pamit, ucapkan sampai jumpa dengan ramah.
Respon dalam bahasa Indonesia yang natural dan conversational.`,
                },
                {
                    role: 'user' as const,
                    content: question,
                },
            ];

            const answer = await chat(conversationalMessages, {
                maxTokens: 500,  // Short response for casual chat
                enableThinking: false
            });

            return NextResponse.json({
                answer,
                citations: [],
                chunksUsed: [],
                metadata: {
                    question,
                    topK,
                    mode,
                    chunksRetrieved: 0,
                    processingTimeMs: Date.now() - startTime,
                    conversational: true,
                },
            });
        }

        // 3. Check Ollama health
        const ollamaHealth = await checkOllamaHealth();
        if (!ollamaHealth.available) {
            return NextResponse.json(
                {
                    error: 'LLM service unavailable',
                    details: ollamaHealth.error
                },
                { status: 503 }
            );
        }

        // 3. Retrieve relevant chunks
        console.log(`[RAG] Processing question: "${question.substring(0, 50)}..."`);

        const retrievalFilters: RetrievalFilters | undefined = filters ? {
            jenis: filters.jenis as RetrievalFilters['jenis'],
            nomor: filters.nomor,
            tahun: filters.tahun,
            pasal: filters.pasal,
            statusAturan: filters.statusAturan as RetrievalFilters['statusAturan'],
            documentId: filters.documentId,
        } : undefined;

        const chunks = await retrieve(question, topK, retrievalFilters);

        if (chunks.length === 0) {
            return NextResponse.json({
                answer: 'Maaf, tidak ditemukan dokumen regulasi yang relevan dengan pertanyaan Anda. Pastikan dokumen sudah di-upload dan di-embed.',
                citations: [],
                chunksUsed: [],
                metadata: {
                    question,
                    topK,
                    mode,
                    chunksRetrieved: 0,
                    processingTimeMs: Date.now() - startTime,
                },
            } satisfies AskResponse);
        }

        // 4. Build RAG messages
        // First, fetch tax rate context if question is tariff-related
        let taxRateContext = '';
        try {
            const taxRateResult = await getTaxRateContextForQuestion(question);
            if (taxRateResult.needed && taxRateResult.items.length > 0) {
                taxRateContext = taxRateResult.context;
                console.log(`[RAG] Tax rate context injected: ${taxRateResult.items.length} rates`);
            }
        } catch (taxRateError) {
            console.warn('[RAG] Tax rate fetch failed:', taxRateError);
        }

        const { messages, labeledChunks } = buildRAGMessages(question, chunks, mode, taxRateContext);

        // 5. Call LLM
        // Note: Thinking step disabled for now as it doubles response time
        // Can be re-enabled later with streaming support for better UX
        console.log(`[RAG] Calling LLM with ${chunks.length} chunks...`);
        const answer = await chat(messages, {
            enableThinking: false,  // Disabled - too slow without streaming
            maxTokens: 8192  // High ceiling, model stops naturally
        });

        // 6. Extract citations used in answer
        const usedLabels = extractCitationsFromAnswer(answer);
        const citations = buildCitationList(labeledChunks, usedLabels);

        // 7. Build chunks used summary
        const chunksUsed: ChunkUsed[] = labeledChunks.map(chunk => ({
            id: chunk.chunkId,
            anchorCitation: chunk.anchorCitation,
            textExcerpt: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
            similarity: chunk.similarity,
        }));

        const processingTimeMs = Date.now() - startTime;
        console.log(`[RAG] Completed in ${processingTimeMs}ms`);

        // 8. Return response
        return NextResponse.json({
            answer,
            citations,
            chunksUsed,
            metadata: {
                question,
                topK,
                mode,
                chunksRetrieved: chunks.length,
                processingTimeMs,
            },
        } satisfies AskResponse);

    } catch (error) {
        console.error('[RAG] Error:', error);

        return NextResponse.json(
            {
                error: 'Internal server error',
                details: (error as Error).message
            },
            { status: 500 }
        );
    }
}

// Health check endpoint
export async function GET() {
    const ollamaHealth = await checkOllamaHealth();

    return NextResponse.json({
        status: ollamaHealth.available ? 'healthy' : 'degraded',
        ollama: ollamaHealth,
        timestamp: new Date().toISOString(),
    });
}
