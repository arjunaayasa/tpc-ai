/**
 * Ollama LLM integration for chat completion
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';

// Dynamic token limits - model will stop naturally when done
// These are maximum ceilings, not targets
const MAX_TOKENS_DEFAULT = 8192;  // High ceiling for complex answers
const MAX_TOKENS_THINKING = 2048; // For internal reasoning step

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatOptions {
    temperature?: number;
    maxTokens?: number;
    enableThinking?: boolean;  // Enable chain-of-thought reasoning
}

interface OllamaChatResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
    done_reason?: string;  // "stop" = natural stop, "length" = hit limit
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

/**
 * Internal thinking step - model reasons through the problem first
 */
async function think(messages: ChatMessage[]): Promise<string> {
    const thinkingMessages: ChatMessage[] = [
        ...messages.slice(0, -1), // All but last user message
        {
            role: 'user',
            content: `${messages[messages.length - 1].content}

Sebelum menjawab, pikirkan langkah-langkah berikut dalam <thinking> tag:
1. Apa poin utama pertanyaan ini?
2. Chunk/konteks mana yang paling relevan?
3. Apakah ada informasi yang tidak tersedia di konteks?
4. Bagaimana struktur jawaban yang terbaik?

<thinking>`,
        },
    ];

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: thinkingMessages,
            stream: false,
            options: {
                temperature: 0.3,
                num_predict: MAX_TOKENS_THINKING,
                stop: ['</thinking>'],
            },
        }),
    });

    if (!response.ok) {
        console.warn('[Ollama] Thinking step failed, proceeding without');
        return '';
    }

    const data = await response.json() as OllamaChatResponse;
    const thinking = data.message.content.replace(/<\/?thinking>/g, '').trim();
    console.log(`[Ollama] Thinking complete (${data.eval_count || 0} tokens)`);
    return thinking;
}

/**
 * Send chat messages to Ollama and get response
 * Supports dynamic token output and optional thinking step
 */
export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const { 
        temperature = 0.2, 
        maxTokens = MAX_TOKENS_DEFAULT,
        enableThinking = false 
    } = options;

    console.log(`[Ollama] Sending chat request to ${OLLAMA_MODEL}${enableThinking ? ' (with thinking)' : ''}`);
    
    let finalMessages = messages;
    
    // Optional thinking step
    if (enableThinking) {
        const thinking = await think(messages);
        if (thinking) {
            // Add thinking as context for the final answer
            finalMessages = [
                ...messages.slice(0, -1),
                {
                    role: 'assistant',
                    content: `<internal_reasoning>\n${thinking}\n</internal_reasoning>`,
                },
                messages[messages.length - 1],
            ];
        }
    }
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: finalMessages,
            stream: false,
            options: {
                temperature,
                num_predict: maxTokens,
                // No hard stop - let model finish naturally
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama chat failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as OllamaChatResponse;
    
    const stopReason = data.done_reason || 'unknown';
    console.log(`[Ollama] Response received (${data.eval_count || 0} tokens, stop: ${stopReason})`);
    
    // Warn if response was truncated
    if (stopReason === 'length') {
        console.warn('[Ollama] Response may be truncated - hit token limit');
    }
    
    return data.message.content;
}

/**
 * Stream chat response from Ollama
 */
export async function* chatStream(
    messages: ChatMessage[], 
    options: ChatOptions = {}
): AsyncGenerator<string, void, unknown> {
    const { temperature = 0.2, maxTokens = MAX_TOKENS_DEFAULT } = options;
    
    console.log(`[Ollama] Starting streaming chat with ${OLLAMA_MODEL}`);
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            stream: true,
            options: {
                temperature,
                num_predict: maxTokens,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama chat failed: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const data = JSON.parse(line) as OllamaChatResponse;
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
 * Check if Ollama is available and model is loaded
 */
export async function checkOllamaHealth(): Promise<{ available: boolean; model: string; error?: string }> {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        if (!response.ok) {
            return { available: false, model: OLLAMA_MODEL, error: 'Ollama not responding' };
        }
        
        const data = await response.json() as { models: { name: string }[] };
        const modelExists = data.models?.some(m => m.name.startsWith(OLLAMA_MODEL.split(':')[0]));
        
        if (!modelExists) {
            return { 
                available: false, 
                model: OLLAMA_MODEL, 
                error: `Model ${OLLAMA_MODEL} not found. Run: ollama pull ${OLLAMA_MODEL}` 
            };
        }
        
        return { available: true, model: OLLAMA_MODEL };
    } catch (error) {
        return { 
            available: false, 
            model: OLLAMA_MODEL, 
            error: `Cannot connect to Ollama at ${OLLAMA_BASE_URL}` 
        };
    }
}
