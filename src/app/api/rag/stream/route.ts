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
import { getTaxRateContextForQuestion, TaxRateContextItem } from '@/lib/tax/taxRateContext';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for streaming

/**
 * Strip thinking/reasoning prefix from answer content
 * DeepSeek Reasoner sometimes mixes thinking with the actual answer
 * This function detects and removes the thinking prefix
 */
function stripThinkingPrefix(text: string): { thinking: string; answer: string } {
    // Common patterns that indicate thinking/reasoning (not the actual answer)
    const thinkingPatterns = [
        /^(Hmm|Okay|Baik|Mari|Pertama|Jadi),?\s/i,
        /^(user\s+bertanya|pertanyaan\s+ini|dari\s+konteks)/i,
        /^(saya\s+perlu|perlu\s+di|harus\s+di)/i,
    ];

    // If text doesn't start with thinking pattern, return as-is
    const startsWithThinking = thinkingPatterns.some(p => p.test(text.trim()));
    if (!startsWithThinking) {
        return { thinking: '', answer: text };
    }

    // Look for markdown heading which typically starts the actual answer
    const headingMatch = text.match(/(\n##\s+[^\n]+)/);
    if (headingMatch && headingMatch.index !== undefined) {
        const thinking = text.substring(0, headingMatch.index).trim();
        const answer = text.substring(headingMatch.index).trim();
        return { thinking, answer };
    }

    // Look for double newline paragraph break as separator
    const paragraphBreak = text.indexOf('\n\n');
    if (paragraphBreak > 50 && paragraphBreak < 500) {
        // Check if text after break looks like actual answer
        const afterBreak = text.substring(paragraphBreak + 2).trim();
        const looksLikeAnswer = /^[#*\-\d]|^[A-Z]/.test(afterBreak);
        if (looksLikeAnswer) {
            return {
                thinking: text.substring(0, paragraphBreak).trim(),
                answer: afterBreak
            };
        }
    }

    // No clear separator found, return as-is
    return { thinking: '', answer: text };
}

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
                    let thinkingContent = '';

                    // Check if model has built-in thinking (DeepSeek Reasoner)
                    const isReasonerModel = modelInfo.hasBuiltinThinking;

                    if (isReasonerModel) {
                        send('status', { stage: 'thinking', message: 'Sedang berpikir...' });
                    } else {
                        send('status', { stage: 'answering', message: 'Menjawab...' });
                    }

                    for await (const chunk of streamChat(model as OwlieModel, casualMessages, {
                        maxTokens: 1000,
                        enableThinking: isReasonerModel,
                    })) {
                        if (chunk.type === 'thinking') {
                            // Show thinking in UI
                            thinkingContent += chunk.text;
                            send('thinking', { token: chunk.text, content: thinkingContent });
                        } else if (chunk.type === 'content') {
                            // Switch to answering when content starts
                            if (!answerContent && thinkingContent) {
                                send('thinking_done', { content: thinkingContent });
                                send('status', { stage: 'answering', message: 'Menyusun jawaban...' });
                            }
                            answerContent += chunk.text;
                            send('answer', { token: chunk.text, content: answerContent });
                        }
                    }

                    // FALLBACK: If reasoner model returned only reasoning_content, no content
                    if (!answerContent.trim() && thinkingContent.trim()) {
                        console.log('[Stream] CASUAL: Using thinking as answer fallback');
                        // Clean thinking content - extract actual response
                        const cleaned = stripThinkingPrefix(thinkingContent);
                        answerContent = cleaned.answer || thinkingContent;
                        send('thinking_done', { content: thinkingContent });
                        send('status', { stage: 'answering', message: 'Menyusun jawaban...' });
                        send('answer', { token: '', content: answerContent });
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

                // 2. Auto-extract document references from question
                // Patterns: PER-17/PJ/2025, PMK-123/PMK.010/2023, PP 36/2008, SE-11/PJ/2024, etc.
                const extractDocRef = (text: string): { nomor?: string; tahun?: number; jenis?: string; pasal?: string } => {
                    const result: { nomor?: string; tahun?: number; jenis?: string; pasal?: string } = {};

                    // Extract regulation number patterns - return ONLY the number, not full reference
                    const perMatch = text.match(/\bPER[- ]?(\d+)\/PJ\/(\d{4})\b/i);
                    if (perMatch) {
                        result.nomor = perMatch[1];  // Just the number
                        result.tahun = parseInt(perMatch[2], 10);
                        result.jenis = 'PER';
                    }

                    const pmkMatch = text.match(/\bPMK[- ]?(\d+)(?:\/PMK\.[^\s\/]+)?\/(\d{4})\b/i);
                    if (pmkMatch) {
                        result.nomor = pmkMatch[1];  // Just the number
                        result.tahun = parseInt(pmkMatch[2], 10);
                        result.jenis = 'PMK';
                    }

                    // PP patterns: "PP 73 Tahun 2016", "PP 73/2016", "PP Nomor 73"
                    const ppMatch = text.match(/\bPP(?:\s+Nomor)?\s+(\d+)(?:\s+Tahun\s+|\/)?(\d{4})?\b/i);
                    if (ppMatch) {
                        result.nomor = ppMatch[1];  // Just the number
                        if (ppMatch[2]) result.tahun = parseInt(ppMatch[2], 10);
                        result.jenis = 'PP';
                    }

                    const seMatch = text.match(/\bSE[- ]?(\d+)\/[A-Z0-9.]+\/(\d{4})\b/i);
                    if (seMatch) {
                        result.nomor = seMatch[1];  // Just the number
                        result.tahun = parseInt(seMatch[2], 10);
                        result.jenis = 'SE';
                    }

                    // Extract pasal number if mentioned
                    const pasalMatch = text.match(/\bPasal\s+(\d+[A-Z]?)\b/i);
                    if (pasalMatch) {
                        result.pasal = pasalMatch[1];
                    }

                    return result;
                };

                const extractedRefs = extractDocRef(question);
                console.log(`[Stream] Extracted refs from question:`, extractedRefs);

                // 2.1. Build retrieval filters (merge explicit filters with extracted refs)
                const retrievalFilters: RetrievalFilters = {
                    jenis: filters?.jenis as RetrievalFilters['jenis'] || extractedRefs.jenis as RetrievalFilters['jenis'],
                    nomor: filters?.nomor || extractedRefs.nomor,
                    tahun: filters?.tahun || extractedRefs.tahun,
                    pasal: filters?.pasal || extractedRefs.pasal,
                };

                // Only pass filters if at least one is defined
                const hasFilters = Object.values(retrievalFilters).some(v => v !== undefined);

                let chunks = await retrieve(question, topK, hasFilters ? retrievalFilters : undefined);

                // If still no results with filters, try without filters for broader search
                if (chunks.length === 0 && hasFilters) {
                    console.log('[Stream] No results with filters, trying broader search...');
                    chunks = await retrieve(question, topK, undefined);
                }

                // If still no results, try to give a helpful AI response anyway
                if (chunks.length === 0) {
                    console.log('[Stream] No chunks found, using AI fallback...');
                    send('status', { stage: 'no_documents', message: 'Tidak ada dokumen relevan, mencoba menjawab...' });

                    // Use AI to give a helpful response even without RAG context
                    const noDocsMessages: ChatMessage[] = [
                        {
                            role: 'system' as const,
                            content: `Kamu adalah TPC AI, asisten perpajakan Indonesia.
                            
User bertanya tentang regulasi atau topik perpajakan, tapi sistem RAG tidak menemukan dokumen yang relevan di database.

Panduan respons:
1. Akui bahwa dokumen spesifik tidak ditemukan di database
2. Jika kamu tahu tentang topik tersebut secara umum, berikan informasi umum yang kamu ketahui
3. Sarankan untuk meng-upload dokumen terkait jika belum ada
4. Jangan membuat-buat isi regulasi spesifik yang tidak kamu ketahui

Contoh format respons:
"Maaf, dokumen [nama regulasi] belum tersedia dalam database saya. Namun, berdasarkan pengetahuan saya...

[informasi umum jika ada]

Untuk mendapatkan informasi yang lebih akurat, silakan upload dokumen [nama regulasi] ke sistem."`,
                        },
                        {
                            role: 'user' as const,
                            content: question,
                        },
                    ];

                    for await (const chunk of streamChat(model as OwlieModel, noDocsMessages, { maxTokens: 1000 })) {
                        if (chunk.type === 'content') {
                            send('answer', { token: chunk.text });
                        }
                    }

                    send('done', { processingTimeMs: Date.now() - startTime, noDocuments: true });
                    close();
                    return;
                }

                send('status', { stage: 'retrieved', chunksCount: chunks.length });

                // 2.5. Fetch tax rate context if question is tariff-related
                let taxRateContext = '';
                let taxRateItems: TaxRateContextItem[] = [];
                try {
                    const taxRateResult = await getTaxRateContextForQuestion(question);
                    if (taxRateResult.needed && taxRateResult.items.length > 0) {
                        taxRateContext = taxRateResult.context;
                        taxRateItems = taxRateResult.items;
                        console.log(`[Stream] Tax rate context injected: ${taxRateItems.length} rates`);
                        send('status', {
                            stage: 'tax_rates_loaded',
                            message: `Memuat ${taxRateItems.length} data tarif...`,
                            taxRatesCount: taxRateItems.length
                        });
                    }
                } catch (taxRateError) {
                    console.warn('[Stream] Tax rate fetch failed:', taxRateError);
                    // Continue without tax rates
                }

                // 3. Build messages with history and tax rate context
                const { messages: baseMessages, labeledChunks } = buildRAGMessages(question, chunks, mode, taxRateContext);
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

                // FALLBACK: If no answer content but we have thinking content,
                // DeepSeek Reasoner may have put everything in reasoning_content
                // Use thinking content as the answer in this case
                if (!answerContent.trim() && thinkingContent.trim()) {
                    console.log('[Stream] FALLBACK: No answer content, using thinking content as answer');
                    answerContent = thinkingContent;
                    // Re-send as answer
                    send('answer', { token: '', content: answerContent });
                }

                // Clean answer content - remove thinking prefix if present
                const cleaned = stripThinkingPrefix(answerContent);
                if (cleaned.thinking) {
                    console.log('[Stream] Stripped thinking prefix from answer:', cleaned.thinking.substring(0, 100));
                    // Update thinkingContent with stripped thinking and re-send
                    if (!thinkingContent) {
                        thinkingContent = cleaned.thinking;
                        send('thinking', { token: '', content: thinkingContent });
                        send('thinking_done', { content: thinkingContent });
                    }
                    // Update answer with cleaned content
                    answerContent = cleaned.answer;
                    send('answer', { token: '', content: answerContent });
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

                // 6.5. Send tax rates if used
                if (taxRateItems.length > 0) {
                    send('taxRates', {
                        taxRates: taxRateItems.map(tr => ({
                            label: tr.label,
                            categoryCode: tr.categoryCode,
                            ruleName: tr.ruleName,
                            ratePercent: tr.ratePercent,
                            rateType: tr.rateType,
                            sourceRef: tr.sourceRef,
                        }))
                    });
                }

                send('done', {
                    processingTimeMs: Date.now() - startTime,
                    tokensThinking: thinkingContent.split(/\s+/).length,
                    tokensAnswer: answerContent.split(/\s+/).length,
                    model: modelInfo.id,
                    taxRatesUsed: taxRateItems.length,
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
