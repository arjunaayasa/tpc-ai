/**
 * Query Planner - Uses QWQ-PLUS to analyze user question
 * Extracts intent, entities, and generates retrieval plan
 */

import { callQWQPlus } from './qwenClient';
import {
    RetrievalPlan,
    IntentType,
    DocumentType,
    ExtractedEntities,
    DEFAULT_RETRIEVAL_CONFIG,
    DEFAULT_DOC_TYPE_PRIORITY,
} from './types';

// ============== PROMPTS ==============

const PLANNER_SYSTEM_PROMPT = `Anda adalah AI Query Planner untuk sistem RAG perpajakan Indonesia.
Tugas: Analisis pertanyaan user dan hasilkan retrieval plan dalam format JSON.

WAJIB output JSON valid dengan struktur yang diminta.`;

function buildPlannerPrompt(question: string): string {
    return `Analisis pertanyaan berikut dan buat retrieval plan:

PERTANYAAN:
"${question}"

OUTPUT JSON dengan schema:
{
  "intent": ["tarif" | "ketentuan_pasal" | "definisi" | "prosedur" | "penegasan_djp" | "putusan" | "lainnya"],
  "entities": {
    "doc_refs": [{ "type": "PMK|PP|PER|UU|PERPU|SE|NOTA_DINAS|PUTUSAN", "number": "..." | null, "year": 2023 | null }],
    "pasal": { "number": number | null, "ayat": number | null, "huruf": string | null },
    "topics": ["topik1", "topik2"]
  },
  "doc_type_priority": ["UU","PMK",...],
  "doc_type_guards": [],
  "query_variants": ["variant1", "variant2", "variant3"],
  "retrieval_config": {
    "vector_top_k_candidate": 300,
    "keyword_top_k_candidate": 200,
    "final_target_chunks": 15,
    "max_chunks_per_document": 3,
    "min_distinct_documents": 5
  },
  "use_tax_rate_registry": boolean
}

RULES:
1. Jika ada "tarif", "berapa persen", "berapa %" → use_tax_rate_registry = true
2. Jika ada "maksud", "penjelasan", "dimaksud" → query_variants harus include "penjelasan pasal demi pasal"
3. Jika ada "penegasan DJP" → prioritas NOTA_DINAS, SE
4. Jika ada "putusan" → doc_type_priority = ["PUTUSAN"]
5. Identifikasi nomor regulasi (contoh: PMK 168/2025, PP 55/2022, PER-17/PJ/2025)
6. Buat 3-5 query variants yang paraphrase pertanyaan

Jawab HANYA dengan JSON, tanpa penjelasan tambahan.`;
}

// ============== JSON Repair ==============

/**
 * Extract and repair JSON from LLM response
 * Uses brace completion when closing braces are missing
 */
function extractAndRepairJSON(text: string): string {
    // Debug: log raw response length
    console.log(`[Planner] Raw response length: ${text.length} chars`);

    // Step 1: Remove markdown code blocks
    let cleaned = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

    // Step 2: Find JSON start
    const startIdx = cleaned.indexOf('{');
    if (startIdx === -1) {
        console.log('[Planner] No JSON object found in response');
        throw new Error('No JSON object found');
    }

    // Extract from first {
    cleaned = cleaned.substring(startIdx);

    // Step 3: Try to find matching closing brace
    let endIdx = cleaned.lastIndexOf('}');

    if (endIdx === -1) {
        // No closing brace found - try brace completion
        console.log('[Planner] No closing brace found, attempting completion...');
        cleaned = completeBraces(cleaned);
    } else {
        // Verify brace matching
        const openCount = (cleaned.substring(0, endIdx + 1).match(/{/g) || []).length;
        const closeCount = (cleaned.substring(0, endIdx + 1).match(/}/g) || []).length;

        if (openCount > closeCount) {
            // Truncated response - need to complete
            console.log(`[Planner] Unbalanced braces (${openCount} open, ${closeCount} close), attempting completion...`);
            cleaned = completeBraces(cleaned.substring(0, endIdx + 1));
        } else {
            cleaned = cleaned.substring(0, endIdx + 1);
        }
    }

    // Step 4: Fix common JSON issues
    cleaned = cleaned
        .replace(/,\s*}/g, '}')           // trailing commas before }
        .replace(/,\s*]/g, ']')           // trailing commas before ]
        .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // unquoted keys
        .replace(/:\s*'([^']*)'/g, ':"$1"') // single-quoted values
        .replace(/\n/g, ' ')              // newlines to spaces
        .replace(/\s+/g, ' ');            // multiple spaces to single

    console.log(`[Planner] Cleaned JSON length: ${cleaned.length} chars`);
    console.log(`[Planner] JSON preview: ${cleaned.substring(0, 150)}...`);

    return cleaned;
}

/**
 * Complete unbalanced braces in JSON
 */
function completeBraces(json: string): string {
    let result = json;

    // Count open vs close braces
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escapeNext = false;

    for (const char of result) {
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (char === '\\') {
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (char === '{') openBraces++;
            else if (char === '}') openBraces--;
            else if (char === '[') openBrackets++;
            else if (char === ']') openBrackets--;
        }
    }

    // Close any unclosed strings
    if (inString) {
        result += '"';
    }

    // Add missing brackets
    for (let i = 0; i < openBrackets; i++) {
        result += ']';
    }

    // Add missing braces
    for (let i = 0; i < openBraces; i++) {
        result += '}';
    }

    console.log(`[Planner] Brace completion: added ${openBrackets} ] and ${openBraces} }`);

    return result;
}

// ============== MAIN FUNCTION ==============

/**
 * Plan retrieval based on user question
 * Uses QWQ-PLUS to analyze intent and entities
 * Includes JSON repair and retry logic
 */
export async function planRetrieval(userQuestion: string): Promise<RetrievalPlan> {
    console.log(`[Planner] Analyzing question: "${userQuestion.substring(0, 50)}..."`);

    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const prompt = buildPlannerPrompt(userQuestion);
            const response = await callQWQPlus(prompt, PLANNER_SYSTEM_PROMPT);

            // Try to extract and parse JSON
            let plan: RetrievalPlan;
            try {
                // Direct parse first
                plan = JSON.parse(response) as RetrievalPlan;
                console.log('[Planner] Direct JSON parse succeeded');
            } catch {
                // Try extraction + repair
                console.log(`[Planner] Attempt ${attempt}: Direct parse failed, trying extraction...`);
                const extracted = extractAndRepairJSON(response);
                plan = JSON.parse(extracted) as RetrievalPlan;
                console.log('[Planner] Extraction + parse succeeded');
            }

            // Validate and apply defaults
            const validatedPlan = validateAndEnrichPlan(plan, userQuestion);

            console.log(`[Planner] ✅ Plan success! Intent: ${validatedPlan.intent.join(', ')}`);
            console.log(`[Planner] Answer depth: ${validatedPlan.answer_depth || 'summary'}`);
            console.log(`[Planner] Use tax registry: ${validatedPlan.use_tax_rate_registry}`);

            return validatedPlan;

        } catch (error) {
            console.warn(`[Planner] Attempt ${attempt} failed:`, (error as Error).message);
            if (attempt === maxRetries) {
                console.log('[Planner] All retries failed, using fallback plan');
                return createFallbackPlan(userQuestion);
            }
        }
    }

    // Should never reach here, but just in case
    return createFallbackPlan(userQuestion);
}

// ============== VALIDATION ==============

function validateAndEnrichPlan(plan: Partial<RetrievalPlan>, question: string): RetrievalPlan {
    const q = question.toLowerCase();

    // Validate intent
    const validIntents: IntentType[] = ['tarif', 'ketentuan_pasal', 'definisi', 'prosedur', 'penegasan_djp', 'putusan', 'lainnya'];
    const intent = (plan.intent || []).filter(i => validIntents.includes(i));
    if (intent.length === 0) {
        intent.push('lainnya');
    }

    // Validate entities
    const entities: ExtractedEntities = {
        doc_refs: plan.entities?.doc_refs || [],
        pasal: plan.entities?.pasal || { number: null, ayat: null, huruf: null },
        topics: plan.entities?.topics || [],
    };

    // Validate doc_refs types
    const validDocTypes: DocumentType[] = ['UU', 'PERPU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'NOTA_DINAS', 'PUTUSAN', 'BUKU', 'UNKNOWN'];
    entities.doc_refs = entities.doc_refs.filter(ref =>
        validDocTypes.includes(ref.type as DocumentType)
    );

    // Apply rules based on question content
    let use_tax_rate_registry = plan.use_tax_rate_registry || false;
    // Always enable registry for tariff-related questions
    // Extended to cover: TER, PTKP, UMKM, PKP, PPh Badan, PPh Final, Natura
    if (/tarif|berapa\s*persen|berapa\s*%|\d+\s*%|ter\s+|ter$|ptkp|penghasilan\s*tidak\s*kena\s*pajak|umkm|pkp|pph\s*badan|pph\s*final|natura|fasilitas\s*kantor|kenikmatan/.test(q)) {
        use_tax_rate_registry = true;
    }

    // Adjust doc_type_priority based on content
    let doc_type_priority = plan.doc_type_priority || [...DEFAULT_DOC_TYPE_PRIORITY];

    if (/penegasan\s*djp|surat\s*edaran/.test(q)) {
        doc_type_priority = ['NOTA_DINAS', 'SE', ...doc_type_priority.filter(t => t !== 'NOTA_DINAS' && t !== 'SE')];
    }

    if (/putusan|pengadilan\s*pajak/.test(q)) {
        doc_type_priority = ['PUTUSAN', ...doc_type_priority.filter(t => t !== 'PUTUSAN')];
    }

    // Ensure query_variants includes penjelasan if needed
    let query_variants = plan.query_variants || [question];
    if (/maksud|penjelasan|dimaksud|arti/.test(q)) {
        if (!query_variants.some(v => v.toLowerCase().includes('penjelasan'))) {
            query_variants.push(`penjelasan pasal demi pasal ${question}`);
        }
    }

    // Ensure we have the original question as variant
    if (!query_variants.some(v => v.toLowerCase() === question.toLowerCase())) {
        query_variants.unshift(question);
    }

    // Limit query variants
    query_variants = query_variants.slice(0, 5);

    // Determine answer_depth based on intent and question complexity
    let answer_depth: 'summary' | 'detailed' | 'comprehensive' = 'summary';

    // Simple intents get summary answers
    if (intent.length === 1 && ['tarif', 'definisi'].includes(intent[0])) {
        answer_depth = 'summary';
    }
    // Questions with "jelaskan", "bagaimana", "apa saja" get detailed
    else if (/jelaskan|bagaimana|apa\\s*saja|sebutkan|rinci/i.test(q)) {
        answer_depth = 'detailed';
    }
    // Questions about specific pasal/ayat get comprehensive
    else if (entities.pasal.number !== null || entities.doc_refs.length > 0) {
        answer_depth = 'detailed';
    }
    // Complex intents get detailed
    else if (intent.length > 1 || intent.includes('prosedur')) {
        answer_depth = 'detailed';
    }

    return {
        intent,
        entities,
        doc_type_priority: doc_type_priority as DocumentType[],
        doc_type_guards: plan.doc_type_guards || [],
        query_variants,
        retrieval_config: {
            ...DEFAULT_RETRIEVAL_CONFIG,
            ...plan.retrieval_config,
        },
        use_tax_rate_registry,
        answer_depth,
    };
}

// ============== FALLBACK ==============

function createFallbackPlan(question: string): RetrievalPlan {
    const q = question.toLowerCase();

    // Simple heuristic-based fallback
    const intent: IntentType[] = [];

    if (/tarif|berapa\s*persen|berapa\s*%/.test(q)) {
        intent.push('tarif');
    }
    if (/pasal|ayat|ketentuan/.test(q)) {
        intent.push('ketentuan_pasal');
    }
    if (/apa\s*(itu|yang\s*dimaksud)|definisi|pengertian|arti/.test(q)) {
        intent.push('definisi');
    }
    if (/bagaimana|prosedur|cara|langkah|proses/.test(q)) {
        intent.push('prosedur');
    }
    if (intent.length === 0) {
        intent.push('lainnya');
    }

    // Extract doc refs using regex
    const doc_refs = extractDocRefsFromQuestion(question);

    // Extract pasal reference
    const pasal = extractPasalFromQuestion(question);

    // Extract topics (simple keyword extraction)
    const topics = extractTopicsFromQuestion(question);

    return {
        intent,
        entities: {
            doc_refs,
            pasal,
            topics,
        },
        doc_type_priority: [...DEFAULT_DOC_TYPE_PRIORITY],
        doc_type_guards: [],
        query_variants: [question],
        retrieval_config: DEFAULT_RETRIEVAL_CONFIG,
        use_tax_rate_registry: /tarif|persen|%/.test(q),
    };
}

// ============== EXTRACTION HELPERS ==============

function extractDocRefsFromQuestion(question: string): ExtractedEntities['doc_refs'] {
    const refs: ExtractedEntities['doc_refs'] = [];

    // PMK pattern: PMK 168/2025, PMK-168/PMK.010/2025
    const pmkMatch = question.match(/PMK[- ]?(\d+)(?:\/\w+)?\/(\d{4})/gi);
    if (pmkMatch) {
        for (const m of pmkMatch) {
            const nums = m.match(/(\d+).*?(\d{4})/);
            if (nums) {
                refs.push({ type: 'PMK', number: nums[1], year: parseInt(nums[2]) });
            }
        }
    }

    // PP pattern: PP 55/2022, PP Nomor 55 Tahun 2022
    const ppMatch = question.match(/PP(?:\s+Nomor)?\s*(\d+)(?:\s+Tahun\s*|\/)(\d{4})/gi);
    if (ppMatch) {
        for (const m of ppMatch) {
            const nums = m.match(/(\d+).*?(\d{4})/);
            if (nums) {
                refs.push({ type: 'PP', number: nums[1], year: parseInt(nums[2]) });
            }
        }
    }

    // PER pattern: PER-17/PJ/2025
    const perMatch = question.match(/PER[- ]?(\d+)\/\w+\/(\d{4})/gi);
    if (perMatch) {
        for (const m of perMatch) {
            const nums = m.match(/(\d+).*?(\d{4})/);
            if (nums) {
                refs.push({ type: 'PER', number: nums[1], year: parseInt(nums[2]) });
            }
        }
    }

    // UU pattern: UU 7/2021, UU Nomor 7 Tahun 2021
    const uuMatch = question.match(/UU(?:\s+Nomor)?\s*(\d+)(?:\s+Tahun\s*|\/)(\d{4})/gi);
    if (uuMatch) {
        for (const m of uuMatch) {
            const nums = m.match(/(\d+).*?(\d{4})/);
            if (nums) {
                refs.push({ type: 'UU', number: nums[1], year: parseInt(nums[2]) });
            }
        }
    }

    // SE pattern: SE-11/PJ/2024
    const seMatch = question.match(/SE[- ]?(\d+)\/\w+\/(\d{4})/gi);
    if (seMatch) {
        for (const m of seMatch) {
            const nums = m.match(/(\d+).*?(\d{4})/);
            if (nums) {
                refs.push({ type: 'SE', number: nums[1], year: parseInt(nums[2]) });
            }
        }
    }

    return refs;
}

function extractPasalFromQuestion(question: string): ExtractedEntities['pasal'] {
    const result = { number: null as number | null, ayat: null as number | null, huruf: null as string | null };

    // Pasal pattern
    const pasalMatch = question.match(/[Pp]asal\s+(\d+[A-Z]?)/);
    if (pasalMatch) {
        result.number = parseInt(pasalMatch[1]);
    }

    // Ayat pattern
    const ayatMatch = question.match(/[Aa]yat\s*\(?(\d+)\)?/);
    if (ayatMatch) {
        result.ayat = parseInt(ayatMatch[1]);
    }

    // Huruf pattern
    const hurufMatch = question.match(/[Hh]uruf\s*([a-z])/);
    if (hurufMatch) {
        result.huruf = hurufMatch[1];
    }

    return result;
}

function extractTopicsFromQuestion(question: string): string[] {
    const topics: string[] = [];
    const q = question.toLowerCase();

    // Tax-related topics
    const taxTopics = [
        { pattern: /pph\s*21|pajak\s*penghasilan\s*21/, topic: 'PPh 21' },
        { pattern: /pph\s*22/, topic: 'PPh 22' },
        { pattern: /pph\s*23/, topic: 'PPh 23' },
        { pattern: /pph\s*(?:final|4\s*ayat\s*2)|pasal\s*4\s*ayat\s*\(?2\)?/, topic: 'PPh Final' },
        { pattern: /pph\s*badan/, topic: 'PPh Badan' },
        { pattern: /ppn|pajak\s*pertambahan\s*nilai/, topic: 'PPN' },
        { pattern: /ptkp|penghasilan\s*tidak\s*kena\s*pajak/, topic: 'PTKP' },
        { pattern: /ter\s*|tarif\s*efektif/, topic: 'TER' },
        { pattern: /withholding/, topic: 'Withholding Tax' },
        { pattern: /faktur\s*pajak/, topic: 'Faktur Pajak' },
        { pattern: /spt/, topic: 'SPT' },
        { pattern: /restitusi/, topic: 'Restitusi' },
    ];

    for (const { pattern, topic } of taxTopics) {
        if (pattern.test(q)) {
            topics.push(topic);
        }
    }

    return topics;
}

export { extractDocRefsFromQuestion, extractPasalFromQuestion, extractTopicsFromQuestion };
