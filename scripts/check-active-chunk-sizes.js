
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('=== CHECKING ACTIVE PUTUSAN CHUNK SIZES ===\n');

    const activeDocs = await prisma.document.findMany({
        where: { isActiveForRAG: true },
        select: { id: true, originalName: true }
    });

    for (const doc of activeDocs) {
        // Skip if not Putusan-like (heuristic)
        if (!doc.originalName.toUpperCase().includes('PUT')) continue;

        console.log(`Document: ${doc.originalName} (${doc.id})`);
        const chunks = await prisma.regulationChunk.findMany({
            where: { documentId: doc.id },
            select: { text: true, chunkType: true, anchorCitation: true }
        });

        const lengths = chunks.map(c => c.text.length);
        const maxLen = Math.max(...lengths);
        const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const countOver2k = lengths.filter(l => l > 2005).length; // 2000 + epsilon

        console.log(`  Total chunks: ${lengths.length}`);
        console.log(`  Max Length: ${maxLen}`);
        console.log(`  Avg Length: ${avgLen.toFixed(0)}`);
        console.log(`  Chunks > 2000 chars: ${countOver2k}`);

        if (countOver2k > 0) {
            console.log('  WARNING: Found chunks larger than 2000 chars!');
            chunks.filter(c => c.text.length > 2005).forEach(c => {
                console.log(`    - [${c.chunkType}] ${c.anchorCitation} (${c.text.length} chars)`);
            });
        }
        console.log('---');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
