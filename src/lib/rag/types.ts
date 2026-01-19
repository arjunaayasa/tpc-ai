/**
 * Advanced RAG Types
 * Shared interfaces for the RAG pipeline
 */

// ============== INTENT & ENTITY ==============

export type DocumentType = 'UU' | 'PERPU' | 'PP' | 'PMK' | 'PER' | 'SE' | 'KEP' | 'NOTA_DINAS' | 'PUTUSAN' | 'BUKU' | 'UNKNOWN';

export type IntentType =
    | 'tarif'
    | 'ketentuan_pasal'
    | 'definisi'
    | 'prosedur'
    | 'penegasan_djp'
    | 'putusan'
    | 'lainnya';

export interface DocReference {
    type: DocumentType;
    number: string | null;
    year: number | null;
}

export interface PasalReference {
    number: number | null;
    ayat: number | null;
    huruf: string | null;
}

export interface ExtractedEntities {
    doc_refs: DocReference[];
    pasal: PasalReference;
    topics: string[];
}

// ============== RETRIEVAL PLAN ==============

export interface RetrievalConfig {
    vector_top_k_candidate: number;
    keyword_top_k_candidate: number;
    final_target_chunks: number;
    max_chunks_per_document: number;
    min_distinct_documents: number;
}

// Answer depth controls response verbosity
export type AnswerDepth = 'summary' | 'detailed' | 'comprehensive';

export interface RetrievalPlan {
    intent: IntentType[];
    entities: ExtractedEntities;
    doc_type_priority: DocumentType[];
    doc_type_guards: DocumentType[];
    query_variants: string[];
    retrieval_config: RetrievalConfig;
    use_tax_rate_registry: boolean;
    answer_depth?: AnswerDepth; // Default: 'summary' for simple intents, 'detailed' for complex
}

// ============== CHUNK CANDIDATE ==============

export interface ChunkCandidate {
    chunkId: string;
    documentId: string;
    anchorCitation: string;
    chunkType: string;
    pasal: string | null;
    ayat: string | null;
    huruf: string | null;
    text: string;
    tokenEstimate: number | null;

    // Scores
    vectorScore: number;
    keywordScore: number;
    finalScore: number;

    // Metadata
    docType: DocumentType;
    docNumber: string | null;
    docYear: number | null;
    docTitle: string | null;
    statusAturan: string;

    // Expansion tracking
    isExpanded?: boolean;
    expandedFrom?: string;
}

// ============== SUFFICIENCY CHECK ==============

export interface ExpansionRequest {
    expand_parent: boolean;
    expand_siblings_window: 0 | 1 | 2;
    expand_penjelasan_for_same_pasal: boolean;
}

export interface AdditionalRetrievalRequest {
    query: string;
    doc_type_priority: DocumentType[];
    must_include_terms: string[];
    focus_chunk_types: string[];
    top_k: number;
}

export interface SufficiencyResult {
    sufficient: boolean;
    missing: string[];
    expansion: ExpansionRequest;
    additional_requests: AdditionalRetrievalRequest[];
}

// ============== FINAL ANSWER ==============

export interface FinalSource {
    sid: string;      // S1, S2, etc.
    doc_type: DocumentType;
    title: string;
    anchor: string;
    excerpt: string;
    chunkId: string;
    documentId: string;
}

export interface AnswerResult {
    answer: string;
    sources: FinalSource[];
    processingTimeMs: number;
}

// ============== ORCHESTRATOR ==============

export interface AdvancedRAGResult {
    answer: string;
    sources: FinalSource[];
    metadata: {
        question: string;
        plan: RetrievalPlan;
        retrieval_passes: number;
        chunks_retrieved: number;
        chunks_after_rerank: number;
        chunks_after_expansion: number;
        sufficiency_checks: number;
        processing_time_ms: number;
    };
}

// ============== RERANKER ==============

export interface RerankedChunk {
    chunkId: string;
    relevanceScore: number;
    reasoning?: string;
}

// ============== DEFAULTS ==============

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
    vector_top_k_candidate: 300,
    keyword_top_k_candidate: 200,
    final_target_chunks: 15,
    max_chunks_per_document: 3,
    min_distinct_documents: 5,
};

export const DEFAULT_DOC_TYPE_PRIORITY: DocumentType[] = [
    'UU', 'PMK', 'PER', 'SE', 'NOTA_DINAS', 'PP', 'PERPU', 'PUTUSAN', 'BUKU'
];
