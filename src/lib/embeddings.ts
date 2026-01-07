/**
 * Embeddings wrapper for TEI (Text Embeddings Inference) or Ollama
 * Provides unified interface for generating embeddings
 */

import { createHash } from 'crypto';

// Environment configuration
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'ollama';
const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || '1024', 10);

export { EMBEDDING_DIM, EMBEDDING_MODEL };

// Max characters for embedding (nomic-embed-text has ~8k token context)
const MAX_EMBED_CHARS = 6000;

/**
 * Truncate text to fit within embedding model context
 */
function truncateForEmbedding(text: string): string {
    if (text.length <= MAX_EMBED_CHARS) return text;
    return text.slice(0, MAX_EMBED_CHARS) + '...';
}

interface TEIResponse {
    embeddings: number[][];
}

interface OllamaEmbeddingResponse {
    embedding: number[];
}

/**
 * Generate embeddings for multiple texts using TEI
 */
async function embedWithTEI(texts: string[]): Promise<number[][]> {
    const truncatedTexts = texts.map(truncateForEmbedding);
    const response = await fetch(`${EMBEDDING_BASE_URL}/embed`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            inputs: truncatedTexts,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`TEI embedding failed: ${response.status} - ${error}`);
    }

    const data = await response.json() as TEIResponse;
    
    // TEI returns { embeddings: [[...], [...]] } or just [[...], [...]]
    if (Array.isArray(data)) {
        return data;
    }
    return data.embeddings;
}

/**
 * Generate embeddings for multiple texts using Ollama
 */
async function embedWithOllama(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Ollama processes one text at a time
    for (const text of texts) {
        const truncatedText = truncateForEmbedding(text);
        const response = await fetch(`${EMBEDDING_BASE_URL}/api/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                prompt: truncatedText,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Ollama embedding failed: ${response.status} - ${error}`);
        }

        const data = await response.json() as OllamaEmbeddingResponse;
        embeddings.push(data.embedding);
    }

    return embeddings;
}

/**
 * Generate embeddings for multiple texts
 * Uses configured provider (TEI or Ollama)
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
        return [];
    }

    // Truncate texts that are too long (rough estimate: 8000 chars ~ 2000 tokens)
    const truncatedTexts = texts.map(t => t.slice(0, 8000));

    if (EMBEDDING_PROVIDER === 'tei') {
        return embedWithTEI(truncatedTexts);
    } else {
        return embedWithOllama(truncatedTexts);
    }
}

/**
 * Generate embedding for a single query text
 */
export async function embedQuery(text: string): Promise<number[]> {
    const embeddings = await embedTexts([text]);
    return embeddings[0];
}

/**
 * Generate SHA256 hash of text for change detection
 */
export function hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex');
}

/**
 * Batch embed texts with progress callback
 * Processes in batches to avoid timeout issues
 */
export async function embedTextsWithBatching(
    texts: string[],
    batchSize: number = 10,
    onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
    const results: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchEmbeddings = await embedTexts(batch);
        results.push(...batchEmbeddings);
        
        if (onProgress) {
            onProgress(Math.min(i + batchSize, texts.length), texts.length);
        }
    }
    
    return results;
}
