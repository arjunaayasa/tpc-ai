/**
 * RAG Orchestrator - Integrates all RAG pipeline components
 * Main entry point for advanced RAG queries
 */

import { planRetrieval } from './planner';
import { hybridRetrieve } from './retriever';
import { scoreBasedRerank } from './reranker';
import { expandContext, applyExpansionConfig } from './contextExpansion';
import { checkSufficiency } from './sufficiency';
import { generateAnswer, streamAnswer, extractCitedSources } from './answer';
import { filterTaxDomain } from './domainGuard';
import { getTaxRateContextForQuestion } from '../tax/taxRateContext';
import {
    RetrievalPlan,
    ChunkCandidate,
    AdvancedRAGResult,
    FinalSource,
} from './types';

// ============== CONFIG ==============

const MAX_RETRIEVAL_PASSES = 2;
const MAX_SUFFICIENCY_CHECKS = 2;
const MAX_FINAL_CHUNKS = 25;

// ============== MAIN FUNCTION ==============

/**
 * Execute advanced RAG pipeline
 * 
 * Flow:
 * 1. Plan retrieval (QWQ-PLUS)
 * 2. Hybrid retrieve (vector + keyword)
 * 3. Rerank (QWQ-PLUS)
 * 4. Expand context (parent/sibling/penjelasan)
 * 5. Check sufficiency (QWQ-PLUS)
 * 6. Optional: second retrieval pass
 * 7. Generate answer (QWEN-MAX)
 */
export async function answerWithAdvancedRAG(
    userQuestion: string
): Promise<AdvancedRAGResult> {
    const startTime = Date.now();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Orchestrator] Starting Advanced RAG`);
    console.log(`[Orchestrator] Question: "${userQuestion.substring(0, 80)}..."`);
    console.log(`${'='.repeat(60)}\n`);

    // ============ STEP 1: PLAN RETRIEVAL ============
    console.log('[Orchestrator] Step 1: Planning retrieval...');
    const plan = await planRetrieval(userQuestion);

    // ============ STEP 2: TAX RATE REGISTRY (if needed) ============
    let taxRateContext = '';
    if (plan.use_tax_rate_registry) {
        console.log('[Orchestrator] Step 1.5: Fetching tax rate context...');
        try {
            const taxResult = await getTaxRateContextForQuestion(userQuestion);
            if (taxResult.needed && taxResult.items.length > 0) {
                taxRateContext = taxResult.context;
                console.log(`[Orchestrator] Tax rates: ${taxResult.items.length} items`);
            }
        } catch (error) {
            console.warn('[Orchestrator] Tax rate fetch failed:', error);
        }
    }

    // ============ STEP 3: HYBRID RETRIEVE (Pass 1) ============
    console.log('[Orchestrator] Step 2: Hybrid retrieval (pass 1)...');
    let chunks = await hybridRetrieve(plan, userQuestion);
    const chunksAfterRetrieval = chunks.length;
    console.log(`[Orchestrator] Retrieved: ${chunks.length} chunks`);

    // ============ STEP 3.5: DOMAIN GUARD (Filter non-tax docs) ============
    console.log('[Orchestrator] Step 2.5: Domain guard filtering...');
    chunks = filterTaxDomain(chunks);
    console.log(`[Orchestrator] After domain guard: ${chunks.length} chunks`);

    // ============ STEP 4: SCORE-BASED SORTING (LLM rerank disabled) ============
    console.log('[Orchestrator] Step 3: Score-based sorting...');
    chunks = scoreBasedRerank(chunks, 30);
    const chunksAfterRerank = chunks.length;
    console.log(`[Orchestrator] After sorting: ${chunks.length} chunks`);

    // ============ STEP 5: INITIAL CONTEXT EXPANSION ============
    console.log('[Orchestrator] Step 4: Initial context expansion...');
    chunks = await expandContext(chunks, plan.intent, 20);

    // Re-apply domain guard after expansion (expanded chunks may include non-tax docs)
    chunks = filterTaxDomain(chunks);
    let chunksAfterExpansion = chunks.length;
    console.log(`[Orchestrator] After expansion + filter: ${chunks.length} chunks`);

    // ============ STEP 6: SUFFICIENCY CHECK LOOP ============
    let retrievalPasses = 1;
    let sufficiencyChecks = 0;

    for (let i = 0; i < MAX_SUFFICIENCY_CHECKS; i++) {
        console.log(`[Orchestrator] Step 5.${i + 1}: Sufficiency check...`);
        sufficiencyChecks++;

        const sufficiency = await checkSufficiency(userQuestion, chunks);

        if (sufficiency.sufficient) {
            console.log('[Orchestrator] Context is sufficient');
            break;
        }

        console.log(`[Orchestrator] Context insufficient. Missing: ${sufficiency.missing.join(', ')}`);

        // Apply expansion if recommended
        if (sufficiency.expansion.expand_parent ||
            sufficiency.expansion.expand_siblings_window > 0 ||
            sufficiency.expansion.expand_penjelasan_for_same_pasal) {

            console.log('[Orchestrator] Applying expansion config...');
            chunks = await applyExpansionConfig(chunks, sufficiency.expansion);
            chunksAfterExpansion = chunks.length;
        }

        // Execute additional retrieval if recommended
        if (sufficiency.additional_requests.length > 0 && retrievalPasses < MAX_RETRIEVAL_PASSES) {
            console.log(`[Orchestrator] Executing additional retrieval (pass ${retrievalPasses + 1})...`);

            for (const request of sufficiency.additional_requests.slice(0, 1)) {
                // Create modified plan for additional retrieval
                const additionalPlan: RetrievalPlan = {
                    ...plan,
                    query_variants: [request.query, ...plan.query_variants.slice(0, 2)],
                    doc_type_priority: request.doc_type_priority,
                    retrieval_config: {
                        ...plan.retrieval_config,
                        vector_top_k_candidate: request.top_k * 10,
                        keyword_top_k_candidate: request.top_k * 5,
                    },
                };

                const additionalChunks = await hybridRetrieve(additionalPlan, request.query);

                // Merge new chunks
                const existingIds = new Set(chunks.map(c => c.chunkId));
                for (const chunk of additionalChunks.slice(0, request.top_k)) {
                    if (!existingIds.has(chunk.chunkId)) {
                        chunks.push(chunk);
                    }
                }
            }

            retrievalPasses++;
            console.log(`[Orchestrator] After pass ${retrievalPasses}: ${chunks.length} chunks`);
        }
    }

    // ============ STEP 7: FINAL CHUNK SELECTION ============
    console.log('[Orchestrator] Step 6: Final chunk selection...');

    // Sort by final score and limit
    chunks = chunks
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, MAX_FINAL_CHUNKS);

    console.log(`[Orchestrator] Final chunks: ${chunks.length}`);

    // ============ STEP 8: GENERATE ANSWER ============
    console.log('[Orchestrator] Step 7: Generating answer with DeepSeek...');
    console.log(`[Orchestrator] Answer depth: ${plan.answer_depth || 'summary'}`);

    // Pass taxRateContext and answer_depth to generateAnswer
    const answerResult = await generateAnswer(
        userQuestion,
        chunks,
        'owlie-thinking',
        taxRateContext,
        plan.answer_depth || 'summary'
    );

    const processingTimeMs = Date.now() - startTime;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Orchestrator] Completed in ${processingTimeMs}ms`);
    console.log(`[Orchestrator] Retrieval passes: ${retrievalPasses}`);
    console.log(`[Orchestrator] Sufficiency checks: ${sufficiencyChecks}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
        answer: answerResult.answer,
        sources: answerResult.sources,
        metadata: {
            question: userQuestion,
            plan,
            retrieval_passes: retrievalPasses,
            chunks_retrieved: chunksAfterRetrieval,
            chunks_after_rerank: chunksAfterRerank,
            chunks_after_expansion: chunksAfterExpansion,
            sufficiency_checks: sufficiencyChecks,
            processing_time_ms: processingTimeMs,
        },
    };
}

// ============== STREAMING VERSION ==============

/**
 * Stream advanced RAG answer (for real-time display)
 */
export async function* streamAdvancedRAG(
    userQuestion: string
): AsyncGenerator<
    { type: 'status' | 'thinking' | 'content'; text: string; data?: unknown },
    AdvancedRAGResult,
    unknown
> {
    const startTime = Date.now();

    yield { type: 'status', text: 'Menganalisis pertanyaan...' };

    // Step 1: Plan
    const plan = await planRetrieval(userQuestion);
    yield { type: 'status', text: 'Mencari dokumen relevan...' };

    // Step 2: Tax rates
    let taxRateContext = '';
    if (plan.use_tax_rate_registry) {
        try {
            const taxResult = await getTaxRateContextForQuestion(userQuestion);
            if (taxResult.needed && taxResult.items.length > 0) {
                taxRateContext = taxResult.context;
                yield { type: 'status', text: `Memuat ${taxResult.items.length} tarif pajak...` };
            }
        } catch {
            // Ignore
        }
    }

    // Step 3: Retrieve
    let chunks = await hybridRetrieve(plan, userQuestion);
    yield { type: 'status', text: `Ditemukan ${chunks.length} dokumen...` };

    // Step 4: Score-based sorting (LLM rerank disabled)
    yield { type: 'status', text: 'Mengurutkan relevansi...' };
    chunks = scoreBasedRerank(chunks, 30);

    // Step 5: Expand
    yield { type: 'status', text: 'Memperluas konteks...' };
    chunks = await expandContext(chunks, plan.intent, 20);

    // Step 6: Sufficiency
    yield { type: 'status', text: 'Memeriksa kelengkapan...' };
    const sufficiency = await checkSufficiency(userQuestion, chunks);

    if (!sufficiency.sufficient && sufficiency.additional_requests.length > 0) {
        yield { type: 'status', text: 'Mencari informasi tambahan...' };

        for (const request of sufficiency.additional_requests.slice(0, 1)) {
            const additionalPlan: RetrievalPlan = {
                ...plan,
                query_variants: [request.query],
                retrieval_config: {
                    ...plan.retrieval_config,
                    vector_top_k_candidate: 50,
                    keyword_top_k_candidate: 30,
                },
            };
            const additionalChunks = await hybridRetrieve(additionalPlan, request.query);
            const existingIds = new Set(chunks.map(c => c.chunkId));
            for (const chunk of additionalChunks.slice(0, 10)) {
                if (!existingIds.has(chunk.chunkId)) {
                    chunks.push(chunk);
                }
            }
        }
    }

    // Step 7: Final selection
    chunks = chunks.sort((a, b) => b.finalScore - a.finalScore).slice(0, MAX_FINAL_CHUNKS);

    // Step 8: Stream answer with tax rate context
    yield { type: 'status', text: 'Menyusun jawaban...' };

    let fullAnswer = '';
    const sources: FinalSource[] = [];

    // Pass taxRateContext to streamAnswer - uses buildRAGMessages with [TR1], [TR2] labels
    for await (const chunk of streamAnswer(userQuestion, chunks, 'owlie-thinking', taxRateContext)) {
        if (chunk.type === 'content') {
            fullAnswer += chunk.text;
            yield { type: 'content', text: chunk.text };
        } else if (chunk.type === 'thinking') {
            yield { type: 'thinking', text: chunk.text };
        }
    }

    return {
        answer: fullAnswer,
        sources,
        metadata: {
            question: userQuestion,
            plan,
            retrieval_passes: 1,
            chunks_retrieved: chunks.length,
            chunks_after_rerank: chunks.length,
            chunks_after_expansion: chunks.length,
            sufficiency_checks: 1,
            processing_time_ms: Date.now() - startTime,
        },
    };
}

export { extractCitedSources };
