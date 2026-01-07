/**
 * RAG Streaming API endpoint with thinking display
 * POST /api/rag/stream
 * 
 * Supports two thinking modes:
 * 1. Built-in thinking (gpt-oss, deepseek-r1) - Model outputs <think> tags automatically
 * 2. Custom thinking (qwen, mistral, etc) - We prompt the model to think first
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { retrieve, RetrievalFilters } from '@/lib/retrieval';
import { ChatMessage } from '@/lib/ollama';
import { 
    buildRAGMessages, 
    extractCitationsFromAnswer, 
    buildCitationList,
    AnswerMode,
    LabeledChunk
} from '@/lib/prompt';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for streaming

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';

// Models with built-in thinking capability (output <think> tags automatically)
const MODELS_WITH_BUILTIN_THINKING = ['gpt-oss', 'deepseek-r1', 'qwq'];

/**
 * Check if current model has built-in thinking
 */
function hasBuiltinThinking(): boolean {
    const modelName = OLLAMA_MODEL.toLowerCase();
    return MODELS_WITH_BUILTIN_THINKING.some(m => modelName.includes(m));
}

/**
 * Parse thinking from response that has built-in <think> tags
 * Returns { thinking, answer } separated
 */
function parseBuiltinThinking(content: string): { thinking: string; answer: string } {
    // Common patterns: <think>...</think>, <thinking>...</thinking>, <reasoning>...</reasoning>
    const thinkPatterns = [
        /<think>([\s\S]*?)<\/think>/i,
        /<thinking>([\s\S]*?)<\/thinking>/i,
        /<reasoning>([\s\S]*?)<\/reasoning>/i,
    ];
    
    for (const pattern of thinkPatterns) {
        const match = content.match(pattern);
        if (match) {
            const thinking = match[1].trim();
            const answer = content.replace(match[0], '').trim();
            return { thinking, answer };
        }
    }
    
    return { thinking: '', answer: content };
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
});

interface OllamaStreamChunk {
    model: string;
    message: { role: string; content: string };
    done: boolean;
    done_reason?: string;
}

/**
 * Stream response from Ollama
 */
async function* streamOllama(
    messages: ChatMessage[], 
    options: { maxTokens?: number; stop?: string[] } = {}
): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            stream: true,
            options: {
                temperature: 0.3,
                num_predict: options.maxTokens || 8192,
                stop: options.stop,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const data = JSON.parse(line) as OllamaStreamChunk;
                if (data.message?.content) {
                    yield data.message.content;
                }
            } catch {
                // Skip non-JSON lines
            }
        }
    }
}

/**
 * Create SSE encoder
 */
function createSSEStream() {
    const encoder = new TextEncoder();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    
    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c;
        },
    });
    
    const send = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
    };
    
    const close = () => {
        controller.close();
    };
    
    return { stream, send, close };
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
        
        const { question, topK, filters, mode, enableThinking } = parseResult.data;
        
        // Create SSE stream
        const { stream, send, close } = createSSEStream();
        
        // Process in background
        (async () => {
            try {
                // 1. Send status
                send('status', { stage: 'retrieving', message: 'Mencari dokumen relevan...' });
                
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
                
                // 3. Build messages
                const { messages, labeledChunks } = buildRAGMessages(question, chunks, mode);
                
                // Detect if model has built-in thinking
                const useBuiltinThinking = hasBuiltinThinking();
                console.log(`[Stream] Model: ${OLLAMA_MODEL}, Built-in thinking: ${useBuiltinThinking}`);
                
                let thinkingContent = '';
                let answerContent = '';
                
                if (enableThinking && useBuiltinThinking) {
                    // ========== BUILT-IN THINKING (gpt-oss, deepseek-r1) ==========
                    // Model will automatically output <think>...</think> tags
                    send('status', { stage: 'thinking', message: 'Sedang menganalisis...' });
                    
                    let fullResponse = '';
                    let inThinkingPhase = true;
                    let thinkingBuffer = '';
                    
                    for await (const token of streamOllama(messages, { maxTokens: 16384 })) {
                        fullResponse += token;
                        
                        // Check if we're still in thinking phase
                        if (inThinkingPhase) {
                            // Look for end of thinking tag
                            if (fullResponse.includes('</think>') || 
                                fullResponse.includes('</thinking>') || 
                                fullResponse.includes('</reasoning>')) {
                                // Parse and separate thinking from answer
                                const parsed = parseBuiltinThinking(fullResponse);
                                thinkingContent = parsed.thinking;
                                answerContent = parsed.answer;
                                
                                send('thinking_done', { content: thinkingContent });
                                send('status', { stage: 'answering', message: 'Menyusun jawaban...' });
                                send('answer', { token: answerContent, content: answerContent });
                                inThinkingPhase = false;
                            } else {
                                // Still in thinking, stream thinking tokens
                                // Extract content after <think> tag
                                const thinkMatch = fullResponse.match(/<think(?:ing)?>([\s\S]*)/i);
                                if (thinkMatch) {
                                    thinkingBuffer = thinkMatch[1];
                                    send('thinking', { token, content: thinkingBuffer });
                                }
                            }
                        } else {
                            // Past thinking phase, stream answer tokens
                            answerContent += token;
                            send('answer', { token, content: answerContent });
                        }
                    }
                    
                    // Final parse in case stream ended without proper tags
                    if (!thinkingContent && !answerContent) {
                        const parsed = parseBuiltinThinking(fullResponse);
                        thinkingContent = parsed.thinking;
                        answerContent = parsed.answer || fullResponse;
                    }
                    
                } else if (enableThinking && !useBuiltinThinking) {
                    // ========== CUSTOM THINKING (qwen, mistral, etc) ==========
                    // We need to prompt the model to think first
                    send('status', { stage: 'thinking', message: 'Sedang menganalisis...' });
                    
                    const thinkingMessages: ChatMessage[] = [
                        ...messages.slice(0, -1),
                        {
                            role: 'user',
                            content: `${messages[messages.length - 1].content}

Sebelum menjawab, analisis dalam <thinking> tag:
1. Poin utama pertanyaan
2. Chunk mana yang paling relevan (sebutkan label C1, C2, dst)
3. Informasi apa yang tersedia dan tidak tersedia
4. Strategi menjawab

<thinking>`,
                        },
                    ];
                    
                    for await (const token of streamOllama(thinkingMessages, { 
                        maxTokens: 1500,
                        stop: ['</thinking>']
                    })) {
                        thinkingContent += token;
                        send('thinking', { token, content: thinkingContent });
                    }
                    
                    send('thinking_done', { content: thinkingContent });
                    
                    // Now generate answer with thinking context
                    send('status', { stage: 'answering', message: 'Menyusun jawaban...' });
                    
                    const answerMessages: ChatMessage[] = [
                        ...messages.slice(0, -1),
                        {
                            role: 'assistant',
                            content: `<analisis_internal>\n${thinkingContent}\n</analisis_internal>\n\nBerdasarkan analisis di atas, saya akan menjawab pertanyaan user.`,
                        },
                        messages[messages.length - 1],
                    ];
                    
                    for await (const token of streamOllama(answerMessages, { maxTokens: 8192 })) {
                        answerContent += token;
                        send('answer', { token, content: answerContent });
                    }
                    
                } else {
                    // ========== NO THINKING ==========
                    // Direct answer without thinking step
                    send('status', { stage: 'answering', message: 'Menyusun jawaban...' });
                    
                    for await (const token of streamOllama(messages, { maxTokens: 8192 })) {
                        answerContent += token;
                        send('answer', { token, content: answerContent });
                    }
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
                    builtinThinking: useBuiltinThinking,
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
