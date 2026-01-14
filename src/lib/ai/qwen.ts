/**
 * Qwen AI Client for structured data extraction (text parsing)
 * Uses Qwen-Plus via DashScope compatible API
 */

const QWEN_API_KEY = process.env.QWEN_API_KEY || '';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus';
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

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
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface ExtractedTable {
    title: string;
    pageContext: string;
    headers: string[];
    rows: { cells: string[] }[];
    notes?: string;
}

export interface TableExtractionResult {
    tables: ExtractedTable[];
    processingNotes: string;
}

/**
 * Call Qwen API with structured output (with retry for rate limits)
 */
async function callQwen(prompt: string, jsonMode: boolean = true, maxRetries: number = 3): Promise<string> {
    if (!QWEN_API_KEY) {
        throw new Error('QWEN_API_KEY not configured');
    }

    const url = `${QWEN_BASE_URL}/chat/completions`;

    const request: QwenRequest = {
        model: QWEN_MODEL,
        messages: [
            {
                role: 'system',
                content: 'Anda adalah AI assistant yang ahli dalam mengekstrak data terstruktur dari dokumen Indonesia. Selalu kembalikan respons dalam format JSON yang valid.'
            },
            {
                role: 'user',
                content: prompt
            }
        ],
        temperature: 0.1,
        max_tokens: 8192,
        ...(jsonMode && { response_format: { type: 'json_object' } })
    };

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
                console.log(`[Qwen] Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
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

            const choice = data.choices[0];
            if (choice.finish_reason === 'content_filter') {
                throw new Error('Qwen blocked response due to content filter');
            }

            return choice.message.content;
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
 * Extract tables from putusan text using Qwen
 */
export async function extractTablesFromText(text: string, sectionName?: string): Promise<TableExtractionResult> {
    const prompt = `Anda adalah ahli dalam mengekstrak data tabular dari dokumen Putusan Pengadilan Pajak Indonesia.

Tugas: Analisis teks berikut dan ekstrak SEMUA tabel yang ada dalam format JSON terstruktur.

Teks dokumen:
---
${text.slice(0, 15000)}
---

${sectionName ? `Konteks: Teks ini dari bagian "${sectionName}"` : ''}

Instruksi:
1. Identifikasi semua tabel perhitungan pajak, daftar bukti, atau data tabular lainnya
2. Tabel biasanya ditandai dengan frasa seperti "perhitungan sebagai berikut", "dengan rincian", atau memiliki format berulang dengan angka
3. Untuk tabel perhitungan pajak, kolom umum meliputi: NO, URAIAN, Pemohon Banding (Rp), Terbanding (Rp), Disetujui/Pembahasan Akhir (Rp)
4. Pastikan angka dalam format Indonesia (titik sebagai pemisah ribuan)
5. Jika tidak ada tabel, kembalikan array kosong

Kembalikan JSON dengan format:
{
  "tables": [
    {
      "title": "Judul tabel (misal: Perhitungan PPh Badan)",
      "pageContext": "Bagian dokumen (misal: Duduk Perkara, Pertimbangan Majelis)",
      "headers": ["NO", "URAIAN", "Pemohon Banding (Rp)", "Terbanding (Rp)", "Disetujui (Rp)"],
      "rows": [
        { "cells": ["1", "Penghasilan Kena Pajak", "755.178.449", "11.854.998.677", "755.178.449"] },
        { "cells": ["2", "PPh Terutang", "113.703.044", "1.473.486.652", "113.703.044"] }
      ],
      "notes": "Catatan tambahan jika ada"
    }
  ],
  "processingNotes": "Catatan proses ekstraksi"
}`;

    try {
        const resultText = await callQwen(prompt, true);
        const result = JSON.parse(resultText) as TableExtractionResult;

        if (!result.tables || !Array.isArray(result.tables)) {
            return { tables: [], processingNotes: 'Invalid response structure' };
        }

        return result;
    } catch (error) {
        console.error('[Qwen] Table extraction failed:', error);
        return {
            tables: [],
            processingNotes: `Extraction failed: ${(error as Error).message}`
        };
    }
}

/**
 * Check if Qwen API is configured and working
 */
export async function checkQwenHealth(): Promise<{ ok: boolean; error?: string }> {
    if (!QWEN_API_KEY) {
        return { ok: false, error: 'QWEN_API_KEY not configured' };
    }

    try {
        const result = await callQwen('Respond with JSON: {"status": "ok"}', true);
        JSON.parse(result);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: (error as Error).message };
    }
}

export { QWEN_MODEL, callQwen };
