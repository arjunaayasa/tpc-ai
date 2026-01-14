// Simulate RAG search for "Pasal 1 PER-17"
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPasal1Competition() {
    // How many "Pasal 1" chunks are there across all documents?
    const allPasal1 = await prisma.regulationChunk.findMany({
        where: { pasal: '1' },
        include: {
            document: {
                include: { metadata: true }
            },
            embedding: { select: { id: true } }
        }
    });

    console.log(`=== Total Pasal 1 chunks in database: ${allPasal1.length} ===\n`);

    // Group by document
    const byDoc = {};
    allPasal1.forEach(c => {
        const nomor = c.document?.metadata?.nomor || 'Unknown';
        byDoc[nomor] = byDoc[nomor] || [];
        byDoc[nomor].push({
            id: c.id,
            hasEmbed: !!c.embedding,
            textLength: c.text.length,
            citation: c.anchorCitation
        });
    });

    console.log('Pasal 1 by document:');
    Object.keys(byDoc).forEach(nomor => {
        const chunks = byDoc[nomor];
        const withEmbed = chunks.filter(c => c.hasEmbed).length;
        console.log(`  - ${nomor}: ${chunks.length} chunks, ${withEmbed} with embedding`);
    });

    // Specifically check PER-17/PJ/2025
    console.log('\n=== PER-17/PJ/2025 Pasal 1 ===');
    const per17 = allPasal1.find(c => c.document?.metadata?.nomor?.includes('PER-17/PJ/2025'));
    if (per17) {
        console.log(`Chunk ID: ${per17.id}`);
        console.log(`Has embedding: ${!!per17.embedding}`);
        console.log(`Text length: ${per17.text.length} chars`);
        console.log(`Text starts with:\n${per17.text.substring(0, 200)}`);
    } else {
        console.log('NOT FOUND!');
    }

    await prisma.$disconnect();
}

checkPasal1Competition();
