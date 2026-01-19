import { hybridRetrieve } from '../src/lib/rag/retriever';
import { planRetrieval } from '../src/lib/rag/planner';
import { expandContext } from '../src/lib/rag/contextExpansion';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('=== DEBUG RAG RETRIEVAL ===');
    const question = "Buat analisa komprehensif putusan di dokumen sumber dengan jumlah kata minimal 5000 kata yang membahas secara terpisah: 1. Pokok Sengketa 2. Dasar Hukum Koreksi Terbanding/Tergugat 3. Ringkasan Pendapat dan Argumen Pemohon Banding/Penggugat secara komprehensif 4. Ringkasan Pendapat dan Argumen Terbanding/Tergugat secara komprehensif 5. Penjelasan alasan utama perbedaan pendapat dan argumen antara Pemohon Banding/Penggugat dengan Terbanding/Tergugat 6. Ringkasan Pendapat Hukum dan Putusan Majelis Hakim secara komprehensif";

    console.log('1. Checking Active Docs in DB:');
    const activeDocs = await prisma.document.findMany({
        where: { isActiveForRAG: true },
        select: { originalName: true }
    });
    activeDocs.forEach(d => console.log(`   ✅ ${d.originalName}`));

    console.log('\n2. Running Planner...');
    const plan = await planRetrieval(question);
    console.log('   Plan Intent:', plan.intent);
    console.log('   Plan Doc Refs:', plan.entities.doc_refs);
    console.log('   Plan Doc Priority:', plan.doc_type_priority);

    console.log('\n3. Running Hybrid Retrieval...');
    const chunks = await hybridRetrieve(plan, question);
    console.log(`   Retrieved ${chunks.length} chunks.`);

    // Group chunks by document
    const docCounts: Record<string, number> = {};
    chunks.forEach(c => {
        const docName = activeDocs.find(d => d.originalName === c.docTitle)?.originalName || 'Unknown'; // docTitle might be title, not filename. 
        // Better to query doc details from ID
    });

    // Get unique doc IDs
    const docIds = [...new Set(chunks.map(c => c.documentId))];
    console.log(`\n   Chunks come from ${docIds.length} unique documents:`);

    const docs = await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, originalName: true, isActiveForRAG: true }
    });

    docs.forEach(d => {
        const count = chunks.filter(c => c.documentId === d.id).length;
        console.log(`   - [${d.isActiveForRAG ? 'ACTIVE' : 'INACTIVE'}] ${d.originalName}: ${count} chunks`);
    });

    if (docs.some(d => !d.isActiveForRAG)) {
        console.error('\n   ❌ CRITICAL ERROR: Retrieved chunks from INACTIVE documents!');
    } else {
        console.log('\n   ✅ Success: All chunks are from ACTIVE documents.');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
