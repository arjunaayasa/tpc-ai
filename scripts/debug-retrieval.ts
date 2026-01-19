
import 'dotenv/config';
import { hybridRetrieve } from '../src/lib/rag/retriever';
import { RetrievalPlan } from '../src/lib/rag/types';

async function debugRetrieval() {
    const question = "Apa saja kategori TER PPh 21?";
    console.log(`Analyzing retrieval for: "${question}"`);

    // Mock plan
    const plan: RetrievalPlan = {
        intent: ['definisi'],
        entities: {
            topics: ['kategori', 'TER', 'PPh 21', 'tarif', 'efektif', 'rata-rata'],
            doc_refs: [],
            pasal: { number: null, ayat: null, huruf: null },
            dates: []
        },
        query_variants: [
            "kategori TER PPh 21",
            "tarif efektif rata-rata kategori A B C",
            "pembagian kategori TER PPh 21"
        ],
        retrieval_config: {
            vector_top_k_candidate: 50,
            keyword_top_k_candidate: 50,
            max_chunks_per_document: 5,
            min_distinct_documents: 2,
            rerank_top_k: 20
        },
        doc_type_guards: [],
        doc_type_priority: ['PP', 'PMK'],
        answer_depth: 'detailed',
        use_tax_rate_registry: true
    };

    const results = await hybridRetrieve(plan, question);

    console.log(`\nRetrieved ${results.length} chunks.`);

    // Check for "Kategori A" or "Lampiran"
    const relevantChunks = results.filter(c =>
        c.text.toLowerCase().includes('kategori a') ||
        c.text.toLowerCase().includes('lampiran') ||
        c.text.toLowerCase().includes('ter')
    );

    console.log(`\nChunks containing 'Kategori A', 'Lampiran', or 'TER': ${relevantChunks.length}`);

    relevantChunks.slice(0, 5).forEach((c, i) => {
        console.log(`\n[${i + 1}] Source: ${c.docTitle}`);
        console.log(`Types: ${c.docType} ${c.docNumber}`);
        console.log(`Preview: ${c.text.substring(0, 200)}...`);
    });
    // Targeted search for Lampiran PP 58
    console.log('\n--- Checking for PP 58 Lampiran ---');
    const targetedPlan: RetrievalPlan = {
        ...plan,
        entities: { ...plan.entities, doc_refs: [{ type: 'PP', number: '58', year: 2023 }] },
        retrieval_config: { ...plan.retrieval_config, vector_top_k_candidate: 100 }
    };

    const targetedResults = await hybridRetrieve(targetedPlan, "Lampiran PP 58 Kategori A B C");

    const lampiranChunks = targetedResults.filter(c =>
        c.text.toLowerCase().includes('kategori a') &&
        (c.docNumber === '58' || c.docTitle?.includes('58'))
    );

    console.log(`\nFound ${lampiranChunks.length} chunks for PP 58 Kategori A.`);

    lampiranChunks.slice(0, 3).forEach((c, i) => {
        console.log(`\n[L${i + 1}] Type: ${c.chunkType}`);
        console.log(`Preview: ${c.text.substring(0, 200)}...`);
    });
}
