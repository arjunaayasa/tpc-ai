/**
 * Qwen AI Client - Multi-model support
 * Supports QWQ-PLUS (reasoner) and QWEN-MAX (generator)
 */

const QWEN_API_KEY = process.env.QWEN_API_KEY || '';
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

// Model identifiers
export const QWEN_MODELS = {
    QWQ_PLUS: 'qwq-plus',           // Reasoner - for planning, reranking, sufficiency
    QWEN_MAX: 'qwen-max',           // Generator - for final answers
    QWEN_PLUS: 'qwen-plus',         // Fallback
} as const;

export type QwenModelId = typeof QWEN_MODELS[keyof typeof QWEN_MODELS];

interface QwenMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface QwenRequest {
    model: string;
    messages: QwenMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' | 'text' };
    stream?: boolean;
}

interface QwenResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string;
            reasoning_content?: string;  // QWQ-PLUS puts response here for reasoners
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface QwenStreamChunk {
    id: string;
    choices: {
        delta: {
            content?: string;
            reasoning_content?: string;
        };
        finish_reason: string | null;
    }[];
}

export interface QwenCallOptions {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    systemPrompt?: string;
}

/**
 * Call Qwen API with specific model
 */
export async function callQwenModel(
    model: QwenModelId,
    prompt: string,
    options: QwenCallOptions = {}
): Promise<string> {
    if (!QWEN_API_KEY) {
        throw new Error('QWEN_API_KEY not configured');
    }

    const {
        temperature = 0.1,
        maxTokens = 8192,
        jsonMode = false,
        systemPrompt = 'You are a helpful AI assistant specialized in Indonesian tax regulations.'
    } = options;

    const url = `${QWEN_BASE_URL}/chat/completions`;

    const request: QwenRequest = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode && { response_format: { type: 'json_object' } })
    };

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${QWEN_API_KEY}`,
                },
                body: JSON.stringify(request),
            });

            if (response.status === 429) {
                const waitMs = Math.pow(2, attempt) * 2000;
                console.log(`[Qwen] Rate limited, waiting ${waitMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Qwen API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json() as QwenResponse;

            if (!data.choices || data.choices.length === 0) {
                throw new Error('Qwen returned no choices');
            }

            const usage = data.usage;
            if (usage) {
                console.log(`[Qwen/${model}] Tokens: ${usage.prompt_tokens} in, ${usage.completion_tokens} out`);
            }

            // Get response - check both content and reasoning_content
            // QWQ-PLUS (reasoner) sometimes puts response in reasoning_content
            const message = data.choices[0].message;
            let result = message.content || '';

            // If content is empty but reasoning_content has content, use that
            if (!result && message.reasoning_content) {
                console.log(`[Qwen/${model}] Using reasoning_content (${message.reasoning_content.length} chars)`);
                result = message.reasoning_content;
            }

            // Log if result is still empty
            if (!result) {
                console.warn(`[Qwen/${model}] WARNING: Both content and reasoning_content are empty`);
                console.log(`[Qwen/${model}] Full message:`, JSON.stringify(message).substring(0, 200));
            }

            return result;

        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                console.log(`[Qwen] Attempt ${attempt + 1} failed, retrying...`);
            }
        }
    }

    throw lastError || new Error('Qwen API failed after retries');
}

/**
 * Stream response from Qwen model
 */
export async function* streamQwenModel(
    model: QwenModelId,
    prompt: string,
    options: QwenCallOptions = {}
): AsyncGenerator<{ type: 'content' | 'thinking'; text: string }, void, unknown> {
    if (!QWEN_API_KEY) {
        throw new Error('QWEN_API_KEY not configured');
    }

    const {
        temperature = 0.3,
        maxTokens = 8192,
        systemPrompt = 'You are a helpful AI assistant specialized in Indonesian tax regulations.'
    } = options;

    const url = `${QWEN_BASE_URL}/chat/completions`;

    const request: QwenRequest = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
        stream: true,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${QWEN_API_KEY}`,
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qwen stream failed: ${response.status} - ${errorText}`);
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
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
                const parsed = JSON.parse(data) as QwenStreamChunk;
                const choice = parsed.choices?.[0];

                if (choice?.delta?.reasoning_content) {
                    yield { type: 'thinking', text: choice.delta.reasoning_content };
                }
                if (choice?.delta?.content) {
                    yield { type: 'content', text: choice.delta.content };
                }
            } catch {
                // Skip non-JSON lines
            }
        }
    }
}

/**
 * Call QWQ-PLUS for JSON output (planning, reranking, sufficiency)
 * NOTE: Using QWEN-PLUS instead because QWQ-PLUS returns empty responses
 */
export async function callQWQPlus(prompt: string, systemPrompt?: string): Promise<string> {
    // Use QWEN-PLUS as QWQ-PLUS returns empty content with the API
    return callQwenModel(QWEN_MODELS.QWEN_PLUS, prompt, {
        jsonMode: true,
        temperature: 0.1,
        maxTokens: 2048,
        systemPrompt: systemPrompt || 'Anda adalah AI assistant. Output hanya JSON valid sesuai schema yang diminta, tanpa penjelasan tambahan.'
    });
}

/**
 * Call QWEN-MAX for final answer generation
 */
export async function callQwenMax(prompt: string, systemPrompt?: string): Promise<string> {
    return callQwenModel(QWEN_MODELS.QWEN_MAX, prompt, {
        jsonMode: false,
        temperature: 0.3,
        maxTokens: 8192,
        systemPrompt: systemPrompt || 'Anda adalah TPC AI, asisten perpajakan Indonesia yang ahli dan teliti.'
    });
}

/**
 * Check if Qwen API is configured
 */
export function isQwenConfigured(): boolean {
    return !!QWEN_API_KEY;
}

// Re-export for backward compatibility
export { QWEN_MODELS as QwenModels };
