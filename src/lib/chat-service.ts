/**
 * Unified Chat Service
 * Supports multiple AI providers with consistent interface
 * 
 * Models:
 * - owlie-loc: Ollama (local qwen2.5:7b-instruct)
 * - owlie-chat: DeepSeek Chat v1.5 (for parsing text)
 * - owlie-thinking: DeepSeek Reasoner v1.5 (80k context, 10k-30k output)
 * - owlie-max: DeepSeek Reasoner v1.5 (128k context, 32k-64k output)
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

export type OwlieModel = 'owlie-loc' | 'owlie-chat' | 'owlie-thinking' | 'owlie-max';

export interface ModelInfo {
    id: OwlieModel;
    name: string;
    description: string;
    provider: 'ollama' | 'deepseek';
    model: string;
    hasBuiltinThinking: boolean;
    maxContextLength: number;
    defaultMaxTokens: number;
    maxOutputTokens: number;
    icon: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
    {
        id: 'owlie-loc',
        name: 'Owlie Local',
        description: 'Model lokal (cepat, offline)',
        provider: 'ollama',
        model: OLLAMA_MODEL,
        hasBuiltinThinking: false,
        maxContextLength: 32000,
        defaultMaxTokens: 8192,
        maxOutputTokens: 8192,
        icon: '🦉',
    },
    {
        id: 'owlie-chat',
        name: 'Owlie Chat v1.5',
        description: 'DeepSeek Chat (parsing text)',
        provider: 'deepseek',
        model: 'deepseek-chat',
        hasBuiltinThinking: false,
        maxContextLength: 64000,
        defaultMaxTokens: 8192,
        maxOutputTokens: 8192,
        icon: '🤖',
    },
    {
        id: 'owlie-thinking',
        name: 'Owlie Thinking v1.5',
        description: 'DeepSeek Reasoner (deep analysis)',
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        hasBuiltinThinking: true,
        maxContextLength: 80000,
        defaultMaxTokens: 10000,
        maxOutputTokens: 30000,
        icon: '🧠',
    },
    {
        id: 'owlie-max',
        name: 'Owlie Max v1.5',
        description: 'DeepSeek Reasoner (max power)',
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        hasBuiltinThinking: true,
        maxContextLength: 128000,
        defaultMaxTokens: 32000,
        maxOutputTokens: 64000,
        icon: '🚀',
    },

];

export function getModelInfo(modelId: OwlieModel): ModelInfo {
    return AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OllamaStreamChunk {
    model: string;
    message: { role: string; content: string };
    done: boolean;
    done_reason?: string;
}

interface DeepSeekStreamChunk {
    id: string;
    choices: {
        delta: {
            content?: string;
            reasoning_content?: string;
        };
        finish_reason: string | null;
    }[];
}

/**
 * Stream response from Ollama
 */
async function* streamOllama(
    messages: ChatMessage[],
    options: { maxTokens?: number; stop?: string[] } = {}
): AsyncGenerator<{ type: 'content' | 'thinking'; text: string }, void, unknown> {
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
                    yield { type: 'content', text: data.message.content };
                }
            } catch {
                // Skip non-JSON lines
            }
        }
    }
}

/**
 * Stream response from DeepSeek
 */
async function* streamDeepSeek(
    messages: ChatMessage[],
    model: string,
    options: { maxTokens?: number } = {}
): AsyncGenerator<{ type: 'content' | 'thinking'; text: string }, void, unknown> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY not configured');
    }

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            temperature: 0.3,
            max_tokens: options.maxTokens || 8192,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek failed: ${response.status} - ${errorText}`);
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
                const parsed = JSON.parse(data) as DeepSeekStreamChunk;
                const choice = parsed.choices?.[0];
                if (choice?.delta?.reasoning_content) {
                    // DeepSeek Reasoner outputs reasoning_content for thinking
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
 * Unified streaming chat function
 */
export async function* streamChat(
    modelId: OwlieModel,
    messages: ChatMessage[],
    options: { maxTokens?: number; stop?: string[]; enableThinking?: boolean } = {}
): AsyncGenerator<{ type: 'content' | 'thinking'; text: string }, void, unknown> {
    const modelInfo = getModelInfo(modelId);

    if (modelInfo.provider === 'ollama') {
        // Use Ollama for local model
        if (options.enableThinking && !modelInfo.hasBuiltinThinking) {
            // Custom thinking for non-thinking models
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

            // Stream thinking
            let thinking = '';
            for await (const chunk of streamOllama(thinkingMessages, {
                maxTokens: 1500,
                stop: ['</thinking>'],
            })) {
                thinking += chunk.text;
                yield { type: 'thinking', text: chunk.text };
            }

            // Now stream answer
            const answerMessages: ChatMessage[] = [
                ...messages.slice(0, -1),
                {
                    role: 'assistant',
                    content: `<analisis_internal>\n${thinking}\n</analisis_internal>\n\nBerdasarkan analisis di atas, saya akan menjawab pertanyaan user.`,
                },
                messages[messages.length - 1],
            ];

            for await (const chunk of streamOllama(answerMessages, { maxTokens: options.maxTokens })) {
                yield chunk;
            }
        } else {
            // Direct streaming
            for await (const chunk of streamOllama(messages, options)) {
                yield chunk;
            }
        }
    } else {
        // Use DeepSeek (cloud)
        for await (const chunk of streamDeepSeek(messages, modelInfo.model, options)) {
            yield chunk;
        }
    }
}

/**
 * Check if model is available/healthy
 */
export async function checkModelHealth(modelId: OwlieModel): Promise<{ ok: boolean; error?: string }> {
    const modelInfo = getModelInfo(modelId);

    try {
        if (modelInfo.provider === 'ollama') {
            const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
            if (!response.ok) {
                return { ok: false, error: 'Ollama not running' };
            }
            return { ok: true };
        } else {
            if (!DEEPSEEK_API_KEY) {
                return { ok: false, error: 'DEEPSEEK_API_KEY not configured' };
            }
            // Quick test call
            const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: modelInfo.model,
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 5,
                }),
            });
            if (!response.ok) {
                return { ok: false, error: `DeepSeek API error: ${response.status}` };
            }
            return { ok: true };
        }
    } catch (error) {
        return { ok: false, error: (error as Error).message };
    }
}
