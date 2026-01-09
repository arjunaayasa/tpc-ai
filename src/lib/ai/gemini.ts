/**
 * Gemini AI Client for structured data extraction
 * Used for parsing tables and structured content from PDF text
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

interface GeminiRequest {
    contents: GeminiMessage[];
    generationConfig?: {
        temperature?: number;
        maxOutputTokens?: number;
        responseMimeType?: string;
    };
}

interface GeminiResponse {
    candidates: {
        content: {
            parts: { text: string }[];
            role: string;
        };
        finishReason: string;
    }[];
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

export interface ExtractedTable {
    title: string;
    pageContext: string; // Which section/page this table belongs to
    headers: string[];
    rows: { cells: string[] }[];
    notes?: string;
}

export interface TableExtractionResult {
    tables: ExtractedTable[];
    processingNotes: string;
}

/**
 * Call Gemini API with structured output (with retry for rate limits)
 */
async function callGemini(prompt: string, jsonMode: boolean = true, maxRetries: number = 3): Promise<string> {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const request: GeminiRequest = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ],
        generationConfig: {
            temperature: 0.1, // Low temperature for structured extraction
            maxOutputTokens: 8192,
            ...(jsonMode && { responseMimeType: 'application/json' })
        }
    };

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });

            if (response.status === 429) {
                // Rate limited - extract retry delay and wait
                const errorData = await response.json();
                const retryDelay = errorData?.error?.details?.find(
                    (d: { '@type': string }) => d['@type']?.includes('RetryInfo')
                )?.retryDelay;
                
                // Parse delay (e.g., "1.5s" -> 1500ms) or default to exponential backoff
                let waitMs = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
                if (retryDelay) {
                    const seconds = parseFloat(retryDelay.replace('s', ''));
                    if (!isNaN(seconds)) {
                        waitMs = Math.ceil(seconds * 1000) + 500; // Add 500ms buffer
                    }
                }
                
                console.log(`[Gemini] Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json() as GeminiResponse;
            
            if (!data.candidates || data.candidates.length === 0) {
                throw new Error('Gemini returned no candidates');
            }

            const candidate = data.candidates[0];
            if (candidate.finishReason === 'SAFETY') {
                throw new Error('Gemini blocked response due to safety filters');
            }

            return candidate.content.parts[0].text;
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                console.log(`[Gemini] Attempt ${attempt + 1} failed, retrying...`);
            }
        }
    }

    throw lastError || new Error('Gemini API failed after retries');
}

/**
 * Extract tables from putusan text using Gemini
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
        const resultText = await callGemini(prompt, true);
        const result = JSON.parse(resultText) as TableExtractionResult;
        
        // Validate structure
        if (!result.tables || !Array.isArray(result.tables)) {
            return { tables: [], processingNotes: 'Invalid response structure' };
        }
        
        return result;
    } catch (error) {
        console.error('[Gemini] Table extraction failed:', error);
        return {
            tables: [],
            processingNotes: `Extraction failed: ${(error as Error).message}`
        };
    }
}

/**
 * Check if Gemini API is configured and working
 */
export async function checkGeminiHealth(): Promise<{ ok: boolean; error?: string }> {
    if (!GEMINI_API_KEY) {
        return { ok: false, error: 'GEMINI_API_KEY not configured' };
    }

    try {
        const result = await callGemini('Respond with: {"status": "ok"}', true);
        JSON.parse(result);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: (error as Error).message };
    }
}

export { GEMINI_MODEL };
