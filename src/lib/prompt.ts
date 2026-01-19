/**
 * Prompt builder for RAG with citation-locked responses
 * All prompts in Indonesian for Indonesian tax regulations
 */

import { ChunkResult } from './retrieval';
import { ChatMessage } from './chat-service';
import { TaxRateContextItem } from './tax/taxRateContext';

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

        // For BUKU type, use judul (book title) as the main identifier
        let docInfo: string;
        if (metadata.jenis === 'BUKU' && metadata.judul) {
            // Use book title directly, optionally with year
            docInfo = metadata.tahun
                ? `${metadata.judul} (${metadata.tahun})`
                : metadata.judul;
        } else {
            // For regulations: show jenis, nomor, tahun
            docInfo = [
                metadata.jenis !== 'UNKNOWN' ? metadata.jenis : null,
                metadata.nomor,
                metadata.tahun ? `Tahun ${metadata.tahun}` : null,
            ].filter(Boolean).join(' ');
        }

        // TRUNCATION: Some chunks are massive (200k+ chars), causing token overflow.
        // We strictly truncate each chunk to 4000 chars (~1000 tokens).
        const SAFE_CHUNK_LIMIT = 4000;
        let pText = chunk.text;
        if (pText.length > SAFE_CHUNK_LIMIT) {
            pText = pText.substring(0, SAFE_CHUNK_LIMIT) + '... [TRUNCATED DUE TO LENGTH]';
        }

        return `[${chunk.label}] ${docInfo ? `(${docInfo}) ` : ''}${citation}
${pText}`;
    }).join('\n\n---\n\n');
}

/**
 * Build system prompt for RAG
 */
function buildSystemPrompt(
    mode: AnswerMode,
    hasTaxRateContext: boolean = false,
    answerDepth: 'summary' | 'detailed' | 'comprehensive' = 'detailed'
): string {
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

    const taxRateInstructions = hasTaxRateContext ? `

DATA TARIF PAJAK:
- Bagian ini berisi referensi resmi dari Tax Rate Registry yang diberi label [TR1], [TR2], dst.
- Gunakan data ini untuk menjawab pertanyaan tentang **tarif, kategori, PTKP, dan definisi**.
- Perhatikan bagian "Catatan" atau "Keterangan" pada setiap item tarif, karena sering berisi detil kategori (misal: TER Kategori A mencakup status TK/0).
- Data ini lebih prioritas dibanding teks dalam chunks jika ada perbedaan angka atau detail tarif.` : '';

    // Depth-specific instructions
    const depthInstructions = {
        summary: `
PANJANG JAWABAN: RINGKAS
- Berikan jawaban LANGSUNG TO THE POINT dalam 2-3 paragraf
- Fokus pada inti pertanyaan, hindari penjelasan berlebihan
- Untuk tarif: sebutkan tarif utama dan sumbernya, jangan elaborasi semua ketentuan
- Jika user butuh detail lebih, mereka akan bertanya lagi`,
        detailed: `
PANJANG JAWABAN: DETAIL
- Jelaskan dengan struktur yang jelas (gunakan header)
- Berikan konteks yang cukup tapi tidak berlebihan
- Sertakan poin-poin penting yang relevan`,
        comprehensive: `
PANJANG JAWABAN: KOMPREHENSIF
- Jelaskan sedetail yang diperlukan
- Sertakan semua aspek relevan dari konteks
- Berikan contoh jika membantu pemahaman`
    };

    return `Anda adalah TPC AI (Owlie), asisten perpajakan Indonesia yang ahli, helpful, dan memiliki pendapat profesional.

IDENTITAS:
- Nama Anda adalah "TPC AI" atau "Owlie".
- Jika ditanya tentang teknologi, model AI, atau sistem yang Anda gunakan, jawab hanya: "Saya TPC AI (Owlie), asisten perpajakan yang dikembangkan oleh TPC."
- DILARANG menyebutkan nama model AI lain seperti Qwen, GPT, Claude, Gemini, atau nama teknis lainnya.
- DILARANG menyebutkan bahwa Anda adalah produk Alibaba, OpenAI, Anthropic, Google, atau perusahaan teknologi lainnya.

${mode === 'strict' ? strictRules : balancedRules}${taxRateInstructions}
${depthInstructions[answerDepth]}

REFERENSI UU:
- Untuk UU Pajak Penghasilan, gunakan "UU PPh" atau "Pasal X UU PPh" (jangan sebutkan nomor/tahun UU lama kecuali relevan)
- UU 7/1983 → UU 10/1994 → UU 17/2000 → UU 36/2008 → UU 7/2021 adalah satu rangkaian perubahan UU PPh
- Cukup sebut "UU PPh" atau "UU PPh sebagaimana diubah terakhir dengan UU HPP"

CARA MENJAWAB:
- Gunakan **Header Markdown** (## Topik Utama, ### Detail) untuk menstruktur jawaban. JANGAN gunakan h1 (#).
- **WAJIB** gunakan jarak antar paragraf (double break) agar teks tidak menumpuk.
- Gunakan bullet points atau numbering untuk list.
- Jawab dengan bahasa Indonesia yang natural, profesional, dan mudah dipahami.
- WAJIB cantumkan sitasi [C1], [C2], dst tepat di akhir kalimat yang relevan.
- Jika ada data tarif, cantumkan juga sitasi [TR1], [TR2], dst untuk referensi tarif.

FORMAT REFERENSI:
- **DILARANG** mencantumkan daftar referensi/pustaka di akhir jawaban.
- Referensi di akhir jawaban sudah ditangani oleh sistem antarmuka (UI) secara otomatis.
- Cukup pastikan sitasi [C1], [TR1] ada di dalam teks jawaban.

PENDAPAT DAN ANALISIS:
- Jika user meminta pendapat, Anda BOLEH memberikan pendapat profesional.
- Bedakan dengan jelas mana yang dari regulasi (gunakan sitasi) dan mana yang pendapat/analisis Anda.
- Untuk pendapat, gunakan frasa seperti: "Menurut analisis saya...", "Saran saya adalah..."

Konteks berisi potongan regulasi yang relevan dengan label [C1], [C2], dst.${hasTaxRateContext ? ' Data tarif pajak diberi label [TR1], [TR2], dst.' : ''}`;
}

/**
 * Build user prompt with question and context
 */
function buildUserPrompt(question: string, chunks: LabeledChunk[], taxRateContext?: string): string {
    const context = buildContext(chunks);

    const taxRateSection = taxRateContext ? `

${taxRateContext}

---
` : '';

    return `KONTEKS REGULASI:
${context}
${taxRateSection}
---

PERTANYAAN:
${question}

Jawab pertanyaan di atas secara lengkap dan komprehensif berdasarkan konteks regulasi yang diberikan.${taxRateContext ? ' Untuk data tarif, gunakan angka dari DATA TARIF PAJAK.' : ''} Jangan batasi panjang jawaban - jelaskan sedetail yang diperlukan.`;
}

/**
 * Build complete chat messages for RAG
 */
export function buildRAGMessages(
    question: string,
    chunks: ChunkResult[],
    mode: AnswerMode = 'strict',
    taxRateContext?: string,
    answerDepth: 'summary' | 'detailed' | 'comprehensive' = 'detailed'
): { messages: ChatMessage[]; labeledChunks: LabeledChunk[] } {
    const labeledChunks = labelChunks(chunks);
    const hasTaxRateContext = !!taxRateContext;

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: buildSystemPrompt(mode, hasTaxRateContext, answerDepth),
        },
        {
            role: 'user',
            content: buildUserPrompt(question, labeledChunks, taxRateContext),
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
): { label: string; chunkId: string; anchorCitation: string; documentId: string; jenis: string; nomor: string | null; tahun: number | null; judul: string | null }[] {
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
            judul: chunk.metadata.judul,
        }));
}

