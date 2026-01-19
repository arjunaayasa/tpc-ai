// Removed import of TS file to avoid errors
// const { hybridRetrieve } = require('../src/lib/rag/retriever');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    const question = "Buat analisa komprehensif putusan di dokumen sumber dengan jumlah kata minimal 5000 kata...";

    // Simulate a plan that looks for 'PUTUSAN'
    const plan = {
        intent: ['putusan'],
        entities: {
            doc_refs: [],
            pasal: { number: null, ayat: null, huruf: null },
            topics: ['pokok sengketa', 'dasar hukum', 'argumen']
        },
        doc_type_priority: ['PUTUSAN'],
        doc_type_guards: [],
        query_variants: [
            question,
            "analisa pokok sengketa putusan pengadilan pajak",
            "dasar hukum koreksi terbanding",
            "pendapat majelis hakim putusan sengketa pajak"
        ],
        retrieval_config: {
            vector_top_k_candidate: 50,
            keyword_top_k_candidate: 30,
            final_target_chunks: 15,
            max_chunks_per_document: 10,
            min_distinct_documents: 1
        },
        use_tax_rate_registry: false
    };

    console.log("=== Testing Retrieval with Manual Plan ===\n");
    console.log(`Question: ${question.substring(0, 50)}...`);

    try {
        // We need to use ts-node or compile files to run this because imports are TS.
        // But since we are in JS script, we can't easily import TS files.
        // HACK: We will reimplement a simplified check using raw SQL to verify the behavior
        // instead of trying to run the TS code directly which is complex.

        console.log("\nChecking active documents in DB first:");
        const activeDocs = await prisma.document.findMany({
            where: { isActiveForRAG: true },
            select: { originalName: true }
        });
        activeDocs.forEach(d => console.log(`- ${d.originalName}`));

        console.log("\nSimulating Vector Search Query...");
        // This query mimics src/lib/rag/retriever.ts
        const vectorQuery = `
            SELECT 
                d."originalName",
                d."isActiveForRAG",
                dm.jenis,
                COUNT(*) as chunks_found
            FROM "RegulationChunk" rc
            JOIN "Document" d ON d.id = rc."documentId"
            LEFT JOIN "DocumentMetadata" dm ON dm."documentId" = rc."documentId"
            WHERE d."isActiveForRAG" = true
            AND (
                rc.text ILIKE '%sengketa%' OR 
                rc.text ILIKE '%putusan%' OR 
                rc.text ILIKE '%banding%'
            )
            GROUP BY d."originalName", d."isActiveForRAG", dm.jenis
        `;

        const results = await prisma.$queryRawUnsafe(vectorQuery);
        console.log(JSON.stringify(results, null, 2));

    } catch (e) {
        console.error(e);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
