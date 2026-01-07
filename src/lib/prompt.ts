/**
 * Prompt builder for RAG with citation-locked responses
 * All prompts in Indonesian for Indonesian tax regulations
 */

import { ChunkResult } from './retrieval';
import { ChatMessage } from './ollama';

export type AnswerMode = 'strict' | 'balanced';

export interface LabeledChunk extends ChunkResult {
    label: string; // C1, C2, etc.
}

/**
 * Label chunks with C1, C2, etc.
 */
export function labelChunks(chunks: ChunkResult[]): LabeledChunk[] {
    return chunks.map((chunk, index) => ({
        ...chunk,
        label: `C${index + 1}`,
    }));
}

/**
 * Build context string from labeled chunks
 */
function buildContext(chunks: LabeledChunk[]): string {
    return chunks.map(chunk => {
        const citation = chunk.anchorCitation;
        const metadata = chunk.metadata;
        const docInfo = [
            metadata.jenis !== 'UNKNOWN' ? metadata.jenis : null,
            metadata.nomor,
            metadata.tahun ? `Tahun ${metadata.tahun}` : null,
        ].filter(Boolean).join(' ');
        
        return `[${chunk.label}] ${docInfo ? `(${docInfo}) ` : ''}${citation}
${chunk.text}`;
    }).join('\n\n---\n\n');
}

/**
 * Build system prompt for RAG
 */
function buildSystemPrompt(mode: AnswerMode): string {
    const strictRules = `
ATURAN PENTING:
1. Jawab berdasarkan konteks regulasi yang diberikan.
2. DILARANG mengarang atau menyebutkan pasal, PMK, PP, atau regulasi yang TIDAK ADA dalam konteks.
3. Sertai setiap kutipan dengan sitasi [C1], [C2], dst sesuai sumber.
4. Jika informasi tidak cukup, sampaikan dengan jelas.`;

    const balancedRules = `
ATURAN:
1. Prioritaskan jawaban dari konteks yang diberikan.
2. Sertai kutipan dengan sitasi [C1], [C2], dst.
3. Jika konteks tidak mencukupi, boleh memberikan penjelasan umum tapi sampaikan bahwa itu bukan dari dokumen yang tersedia.
4. DILARANG mengarang nomor pasal atau regulasi yang tidak ada di konteks.`;

    return `Anda adalah TPC AI, asisten perpajakan Indonesia yang ahli dan helpful.

${mode === 'strict' ? strictRules : balancedRules}

CARA MENJAWAB:
- Jawab dengan lengkap, detail, dan komprehensif sesuai kebutuhan pertanyaan.
- Gunakan bahasa Indonesia yang natural dan mudah dipahami.
- Jelaskan konsep dengan jelas, berikan contoh jika membantu.
- Tidak perlu mengikuti format tertentu - jawab secara natural seperti seorang konsultan pajak yang ahli.
- Boleh menggunakan bullet points, numbering, atau paragraf sesuai kebutuhan.
- WAJIB cantumkan sitasi [C1], [C2], dst saat mengutip dari konteks.
- Di akhir jawaban, cantumkan daftar referensi yang digunakan.

Konteks berisi potongan regulasi yang relevan dengan label [C1], [C2], dst.`;
}

/**
 * Build user prompt with question and context
 */
function buildUserPrompt(question: string, chunks: LabeledChunk[]): string {
    const context = buildContext(chunks);
    
    return `KONTEKS REGULASI:
${context}

---

PERTANYAAN:
${question}

Jawab pertanyaan di atas secara lengkap dan komprehensif berdasarkan konteks regulasi yang diberikan. Jangan batasi panjang jawaban - jelaskan sedetail yang diperlukan.`;
}

/**
 * Build complete chat messages for RAG
 */
export function buildRAGMessages(
    question: string,
    chunks: ChunkResult[],
    mode: AnswerMode = 'strict'
): { messages: ChatMessage[]; labeledChunks: LabeledChunk[] } {
    const labeledChunks = labelChunks(chunks);
    
    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: buildSystemPrompt(mode),
        },
        {
            role: 'user',
            content: buildUserPrompt(question, labeledChunks),
        },
    ];
    
    return { messages, labeledChunks };
}

/**
 * Extract citations from answer text
 * Returns array of labels used (C1, C2, etc.)
 */
export function extractCitationsFromAnswer(answer: string): string[] {
    const regex = /\[C(\d+)\]/g;
    const citations = new Set<string>();
    let match;
    
    while ((match = regex.exec(answer)) !== null) {
        citations.add(`C${match[1]}`);
    }
    
    return Array.from(citations).sort((a, b) => {
        const numA = parseInt(a.slice(1));
        const numB = parseInt(b.slice(1));
        return numA - numB;
    });
}

/**
 * Build citation list for response
 */
export function buildCitationList(
    labeledChunks: LabeledChunk[],
    usedLabels: string[]
): { label: string; chunkId: string; anchorCitation: string; documentId: string; jenis: string; nomor: string | null; tahun: number | null }[] {
    return labeledChunks
        .filter(chunk => usedLabels.includes(chunk.label))
        .map(chunk => ({
            label: chunk.label,
            chunkId: chunk.chunkId,
            anchorCitation: chunk.anchorCitation,
            documentId: chunk.documentId,
            jenis: chunk.metadata.jenis,
            nomor: chunk.metadata.nomor,
            tahun: chunk.metadata.tahun,
        }));
}
