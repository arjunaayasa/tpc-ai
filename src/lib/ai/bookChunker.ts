/**
 * AI-Based Book Chunker using DeepSeek
 * OPTIMIZED: Single-pass structure detection + local splitting
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

// Chunk size limits
const TARGET_CHUNK_SIZE = 2500;

export interface BookChunk {
    title: string;
    chunkType: 'BAB' | 'SUBBAB' | 'SECTION' | 'PREAMBLE';
    text: string;
    orderIndex: number;
    tokenEstimate: number;
    anchorCitation: string;
}

export interface BookMeta {
    jenis?: string;
    nomor?: string | null;
    tahun?: number | null;
    judul?: string | null;
}

interface StructureItem {
    type: 'BAB' | 'SUBBAB' | 'SECTION';
    title: string;
    searchPattern: string; // Keyword to find in fullText
}

interface AIStructureResponse {
    outline: StructureItem[];
}

/**
 * Call DeepSeek API - single call
 */
async function callDeepSeek(prompt: string, systemPrompt: string): Promise<string> {
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
            model: DEEPSEEK_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 4096,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

/**
 * Phase 1: Detect book structure with single AI call
 * Only send first part of text to identify outline
 */
async function detectBookStructure(text: string): Promise<StructureItem[]> {
    // Send first 15k chars - enough to find TOC or early chapters
    const sampleText = text.slice(0, 15000);

    const systemPrompt = `Anda adalah AI yang menganalisis struktur buku Indonesia.
Tugas: Identifikasi outline/struktur bab dari teks buku.
Kembalikan JSON dengan daftar bab dan subbab.`;

    const prompt = `Analisis teks awal buku berikut dan identifikasi strukturnya:

TEKS:
---
${sampleText}
---

Identifikasi semua BAB (chapter) dan SUBBAB yang ada.
Untuk setiap item, berikan:
- type: "BAB" atau "SUBBAB" atau "SECTION"
- title: Judul lengkap (contoh: "BAB I KETENTUAN UMUM")
- searchPattern: Kata kunci UNIK untuk menemukan bab ini di teks (contoh: "BAB I")

Kembalikan JSON:
{
  "outline": [
    { "type": "BAB", "title": "BAB I KETENTUAN UMUM", "searchPattern": "BAB I" },
    { "type": "SUBBAB", "title": "A. Definisi", "searchPattern": "A. Definisi" },
    { "type": "BAB", "title": "BAB II SUBJEK PAJAK", "searchPattern": "BAB II" }
  ]
}

Jika tidak menemukan struktur bab yang jelas, kembalikan outline kosong: { "outline": [] }`;

    const resultText = await callDeepSeek(prompt, systemPrompt);
    const result = JSON.parse(resultText) as AIStructureResponse;

    return result.outline || [];
}

/**
 * Phase 2: Split text locally using detected structure
 */
function splitByStructure(fullText: string, outline: StructureItem[], meta: BookMeta): BookChunk[] {
    const chunks: BookChunk[] = [];

    if (outline.length === 0) {
        // No structure detected - use simple paragraph chunking
        return fallbackChunking(fullText, meta);
    }

    // Find positions of each outline item
    const positions: { item: StructureItem; index: number }[] = [];

    for (const item of outline) {
        // Search for the pattern (case insensitive)
        const regex = new RegExp(escapeRegex(item.searchPattern), 'i');
        const match = regex.exec(fullText);

        if (match) {
            positions.push({ item, index: match.index });
        }
    }

    // Sort by position
    positions.sort((a, b) => a.index - b.index);

    // Handle preamble (text before first chapter)
    if (positions.length > 0 && positions[0].index > 200) {
        const preambleText = fullText.slice(0, positions[0].index).trim();
        if (preambleText.length > 100) {
            chunks.push({
                title: 'Pendahuluan',
                chunkType: 'PREAMBLE',
                text: preambleText,
                orderIndex: 0,
                tokenEstimate: estimateTokens(preambleText),
                anchorCitation: generateCitation(meta, 'Pendahuluan'),
            });
        }
    }

    // Create chunks for each section
    for (let i = 0; i < positions.length; i++) {
        const current = positions[i];
        const next = positions[i + 1];

        const startIndex = current.index;
        const endIndex = next ? next.index : fullText.length;

        const sectionText = fullText.slice(startIndex, endIndex).trim();

        // Split large sections into smaller chunks
        const sectionChunks = splitLargeSection(sectionText, current.item, chunks.length, meta);
        chunks.push(...sectionChunks);
    }

    return chunks;
}

/**
 * Split large section into smaller chunks at paragraph boundaries
 */
function splitLargeSection(
    text: string,
    item: StructureItem,
    startIndex: number,
    meta: BookMeta
): BookChunk[] {
    const chunks: BookChunk[] = [];

    if (text.length <= TARGET_CHUNK_SIZE * 1.5) {
        // Small enough
        chunks.push({
            title: item.title,
            chunkType: item.type,
            text,
            orderIndex: startIndex,
            tokenEstimate: estimateTokens(text),
            anchorCitation: generateCitation(meta, item.title),
        });
    } else {
        // Split at paragraph boundaries
        const paragraphs = text.split(/\n\n+/);
        let currentChunk = '';
        let chunkNum = 0;

        for (const para of paragraphs) {
            if (currentChunk.length + para.length > TARGET_CHUNK_SIZE && currentChunk.length > 500) {
                chunks.push({
                    title: chunkNum === 0 ? item.title : `${item.title} (lanjutan)`,
                    chunkType: chunkNum === 0 ? item.type : 'SECTION',
                    text: currentChunk.trim(),
                    orderIndex: startIndex + chunkNum,
                    tokenEstimate: estimateTokens(currentChunk),
                    anchorCitation: generateCitation(meta, item.title, chunkNum > 0 ? chunkNum : undefined),
                });
                currentChunk = para;
                chunkNum++;
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + para;
            }
        }

        if (currentChunk.trim()) {
            chunks.push({
                title: chunkNum === 0 ? item.title : `${item.title} (lanjutan)`,
                chunkType: chunkNum === 0 ? item.type : 'SECTION',
                text: currentChunk.trim(),
                orderIndex: startIndex + chunkNum,
                tokenEstimate: estimateTokens(currentChunk),
                anchorCitation: generateCitation(meta, item.title, chunkNum > 0 ? chunkNum : undefined),
            });
        }
    }

    return chunks;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function generateCitation(meta: BookMeta, title: string, part?: number): string {
    const parts: string[] = [];

    if (meta.judul) {
        parts.push(meta.judul.slice(0, 50));
    }

    parts.push(title);

    if (part) {
        parts.push(`bagian ${part}`);
    }

    return parts.join(' - ');
}

/**
 * Main function: Parse book with AI (OPTIMIZED - single API call)
 */
export async function parseBookWithAI(fullText: string, meta: BookMeta): Promise<BookChunk[]> {
    console.log('[BookChunker] Starting AI-based book parsing (optimized single-pass)...');

    try {
        // Phase 1: Single AI call to detect structure
        console.log('[BookChunker] Detecting book structure...');
        const outline = await detectBookStructure(fullText);
        console.log(`[BookChunker] Found ${outline.length} structure items`);

        // Phase 2: Local splitting based on detected structure
        console.log('[BookChunker] Splitting text locally...');
        const chunks = splitByStructure(fullText, outline, meta);

        console.log(`[BookChunker] Created ${chunks.length} chunks`);
        return chunks;
    } catch (error) {
        console.error('[BookChunker] AI failed, using fallback:', error);
        return fallbackChunking(fullText, meta);
    }
}

/**
 * Fallback: Simple paragraph-based chunking
 */
function fallbackChunking(text: string, meta: BookMeta): BookChunk[] {
    console.log('[BookChunker] Using fallback chunking');
    const chunks: BookChunk[] = [];
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let orderIndex = 0;

    for (const para of paragraphs) {
        if (currentChunk.length + para.length > TARGET_CHUNK_SIZE && currentChunk.length > 500) {
            chunks.push({
                title: `Bagian ${orderIndex + 1}`,
                chunkType: 'SECTION',
                text: currentChunk.trim(),
                orderIndex,
                tokenEstimate: estimateTokens(currentChunk),
                anchorCitation: generateCitation(meta, `Bagian ${orderIndex + 1}`),
            });
            currentChunk = para;
            orderIndex++;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + para;
        }
    }

    if (currentChunk.trim()) {
        chunks.push({
            title: `Bagian ${orderIndex + 1}`,
            chunkType: 'SECTION',
            text: currentChunk.trim(),
            orderIndex,
            tokenEstimate: estimateTokens(currentChunk),
            anchorCitation: generateCitation(meta, `Bagian ${orderIndex + 1}`),
        });
    }

    return chunks;
}

/**
 * Check if API is available
 */
export function isAIChunkingAvailable(): boolean {
    return !!DEEPSEEK_API_KEY;
}
