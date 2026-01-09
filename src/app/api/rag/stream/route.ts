/**
 * RAG Streaming API endpoint with thinking display
 * POST /api/rag/stream
 * 
 * Supports multiple models:
 * - owlie-loc: Ollama (local)
 * - owlie-chat: DeepSeek Chat (fast parsing)
 * - owlie-thinking: DeepSeek Reasoner (thinking)
 * - owlie-max: DeepSeek Reasoner (long context)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { retrieve, RetrievalFilters } from '@/lib/retrieval';
import { ChatMessage, streamChat, getModelInfo, OwlieModel, AVAILABLE_MODELS } from '@/lib/chat-service';
import {
    buildRAGMessages,
    extractCitationsFromAnswer,
    buildCitationList,
} from '@/lib/prompt';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for streaming

// Request validation schema
const streamRequestSchema = z.object({
    question: z.string().min(3).max(2000),
    topK: z.number().int().min(1).max(50).default(12),
    filters: z.object({
        jenis: z.enum(['UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'UNKNOWN']).optional(),
        nomor: z.string().optional(),
        tahun: z.number().int().min(1900).max(2100).optional(),
        pasal: z.string().optional(),
    }).optional(),
    mode: z.enum(['strict', 'balanced']).default('strict'),
    enableThinking: z.boolean().default(true),
    model: z.enum(['owlie-loc', 'owlie-chat', 'owlie-thinking', 'owlie-max']).default('owlie-loc'),
    history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
    })).optional().default([]),
});

/**
 * Create SSE encoder
 */
function createSSEStream() {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let isClosed = false;

    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c;
        },
    });

    const send = (event: string, data: unknown) => {
        if (isClosed) return;
        try {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
        } catch (e) {
            isClosed = true;
            console.warn('[Stream] Controller enqueue failed:', e);
        }
    };

    const close = () => {
        if (isClosed) return;
        isClosed = true;
        try {
            controller.close();
        } catch (e) {
            console.warn('[Stream] Controller close failed:', e);
        }
    };

    return { stream, send, close };
}

// Tax-related keywords that indicate the question needs RAG
const TAX_KEYWORDS = [
    'pajak', 'pph', 'ppn', 'ppnbm', 'pbb', 'bphtb', 'bea', 'cukai',
    'tarif', 'pasal', 'ayat', 'peraturan', 'undang-undang', 'uu', 'pp', 'pmk', 'per', 'se', 'kep',
    'wajib pajak', 'wp', 'npwp', 'spt', 'faktur', 'bupot', 'skp', 'skpkb', 'skplb',
    'penghasilan', 'ptkp', 'pkp', 'dpp', 'objek', 'subjek',
    'potongan', 'pemotongan', 'pemungutan', 'setoran', 'lapor', 'bayar',
    'pengembalian', 'restitusi', 'keberatan', 'banding', 'gugatan',
    'sanksi', 'denda', 'bunga', 'kenaikan',
    'hitung', 'perhitungan', 'kalkulasi',
    'putusan', 'pengadilan', 'majelis', 'hakim',
];

/**
 * Check if question is casual/greeting (doesn't need RAG)
 * Uses hybrid approach: short question + no tax keywords
 */
function isCasualQuestion(question: string): boolean {
    const q = question.toLowerCase().trim();
    const wordCount = q.split(/\s+/).length;

    // If more than 20 words, likely needs RAG
    if (wordCount > 20) {
        return false;
    }

    // Check if contains any tax-related keywords
    const hasTaxKeyword = TAX_KEYWORDS.some(keyword => q.includes(keyword));
    if (hasTaxKeyword) {
        return false;
    }

    // Short question without tax keywords = casual
    return wordCount <= 20;
}

/**
 * Build casual conversation messages for AI
 */
function buildCasualMessages(question: string): ChatMessage[] {
    return [
        {
            role: 'system',
            content: `Anda adalah TPC AI (Owlie), asisten perpajakan Indonesia yang ramah dan helpful.

IDENTITAS:
- Nama Anda adalah "TPC AI" atau "Owlie".
- Jika ditanya tentang model AI, teknologi, atau siapa yang membuat Anda, jawab: "Saya TPC AI (Owlie), asisten perpajakan yang dikembangkan oleh TPC."
- DILARANG menyebutkan nama model AI seperti Qwen, GPT, Claude, Gemini, LLaMA, atau nama teknis lainnya.
- DILARANG menyebutkan Alibaba, OpenAI, Anthropic, Google, Meta, atau perusahaan teknologi lainnya.

CARA MENJAWAB:
- Jawab dengan natural, ramah, dan singkat untuk pertanyaan casual.
- Gunakan bahasa Indonesia yang santai tapi sopan.
- Boleh gunakan emoji sesekali untuk membuat percakapan lebih friendly.
- Jika user menyapa, sapa balik dan tawarkan bantuan tentang perpajakan.
- Jika tidak yakin maksud user, tanyakan apakah ada pertanyaan perpajakan yang bisa dibantu.`
        },
        {
            role: 'user',
            content: question
        }
    ];
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();

    try {
        const body = await request.json();
        const parseResult = streamRequestSchema.safeParse(body);

        if (!parseResult.success) {
            return new Response(JSON.stringify({ error: 'Invalid request' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const { question, topK, filters, mode, enableThinking, model, history } = parseResult.data;
        const modelInfo = getModelInfo(model as OwlieModel);

        // Create SSE stream
        const { stream, send, close } = createSSEStream();

        // Process in background
        (async () => {
            try {
                // Check if casual question (no RAG needed)
                if (isCasualQuestion(question)) {
                    console.log(`[Stream] Casual question detected, using AI for natural response`);
                    send('status', {
                        stage: 'answering',
                        message: 'Menjawab...',
                        model: { id: modelInfo.id, name: modelInfo.name, icon: modelInfo.icon }
                    });

                    // Use AI to generate natural casual response with history
                    const baseCasualMessages = buildCasualMessages(question);
                    const casualMessages = [
                        baseCasualMessages[0], // System
                        ...history,
                        baseCasualMessages[1]  // User
                    ];
                    let answerContent = '';

                    for await (const chunk of streamChat(model as OwlieModel, casualMessages, {
                        maxTokens: 500,  // Short response for casual
                        enableThinking: false,
                    })) {
                        if (chunk.type === 'content') {
                            answerContent += chunk.text;
                            send('answer', { token: chunk.text, content: answerContent });
                        }
                    }

                    send('done', { processingTimeMs: Date.now() - startTime, model: modelInfo.id });
                    close();
                    return;
                }

                // 1. Send status with model info
                send('status', {
                    stage: 'retrieving',
                    message: 'Mencari dokumen relevan...',
                    model: {
                        id: modelInfo.id,
                        name: modelInfo.name,
                        icon: modelInfo.icon,
                    }
                });

                // 2. Retrieve chunks
                const retrievalFilters: RetrievalFilters | undefined = filters ? {
                    jenis: filters.jenis as RetrievalFilters['jenis'],
                    nomor: filters.nomor,
                    tahun: filters.tahun,
                    pasal: filters.pasal,
                } : undefined;

                const chunks = await retrieve(question, topK, retrievalFilters);

                if (chunks.length === 0) {
                    send('answer', { content: 'Maaf, tidak ditemukan dokumen relevan.' });
                    send('done', { processingTimeMs: Date.now() - startTime });
                    close();
                    return;
                }

                send('status', { stage: 'retrieved', chunksCount: chunks.length });

                // 3. Build messages with history
                const { messages: baseMessages, labeledChunks } = buildRAGMessages(question, chunks, mode);
                const messages = [
                    baseMessages[0], // System
                    ...history,
                    baseMessages[1]  // User with context
                ];

                console.log(`[Stream] Using model: ${modelInfo.id} (${modelInfo.model}), Built-in thinking: ${modelInfo.hasBuiltinThinking}`);

                let thinkingContent = '';
                let answerContent = '';

                // 4. Stream response using unified chat service
                const shouldEnableThinking = enableThinking && (modelInfo.hasBuiltinThinking || model === 'owlie-loc');

                if (shouldEnableThinking) {
                    send('status', { stage: 'thinking', message: 'Sedang menganalisis...' });
                }

                let currentStage: 'thinking' | 'answering' = shouldEnableThinking ? 'thinking' : 'answering';

                if (!shouldEnableThinking) {
                    send('status', { stage: 'answering', message: 'Menyusun jawaban...' });
                }

                for await (const chunk of streamChat(model as OwlieModel, messages, {
                    maxTokens: 8192,
                    enableThinking: shouldEnableThinking,
                })) {
                    if (chunk.type === 'thinking') {
                        thinkingContent += chunk.text;
                        send('thinking', { token: chunk.text, content: thinkingContent });
                    } else {
                        // Switch from thinking to answering
                        if (currentStage === 'thinking' && chunk.type === 'content') {
                            send('thinking_done', { content: thinkingContent });
                            send('status', { stage: 'answering', message: 'Menyusun jawaban...' });
                            currentStage = 'answering';
                        }
                        answerContent += chunk.text;
                        send('answer', { token: chunk.text, content: answerContent });
                    }
                }

                // Ensure thinking_done is sent if there was thinking
                if (thinkingContent && currentStage === 'thinking') {
                    send('thinking_done', { content: thinkingContent });
                }

                // 5. Extract citations
                const usedLabels = extractCitationsFromAnswer(answerContent);
                const citations = buildCitationList(labeledChunks, usedLabels);

                // 6. Send final data
                send('citations', { citations });
                send('chunks', {
                    chunks: labeledChunks.map(c => ({
                        id: c.chunkId,
                        label: c.label,
                        anchorCitation: c.anchorCitation,
                        textExcerpt: c.text.substring(0, 300),
                        similarity: c.similarity,
                    }))
                });
                send('done', {
                    processingTimeMs: Date.now() - startTime,
                    tokensThinking: thinkingContent.split(/\s+/).length,
                    tokensAnswer: answerContent.split(/\s+/).length,
                    model: modelInfo.id,
                });

            } catch (error) {
                console.error('[Stream] Error:', error);
                send('error', { message: (error as Error).message });
            } finally {
                close();
            }
        })();

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error('[Stream] Parse error:', error);
        return new Response(JSON.stringify({ error: 'Server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

/**
 * GET /api/rag/stream
 * Return available models
 */
export async function GET() {
    return Response.json({ models: AVAILABLE_MODELS });
}
