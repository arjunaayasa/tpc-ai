const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('=== Documents RAG Status ===\n');

    const docs = await prisma.document.findMany({
        select: {
            id: true,
            originalName: true,
            isActiveForRAG: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    const activeCount = docs.filter(d => d.isActiveForRAG).length;
    const inactiveCount = docs.filter(d => !d.isActiveForRAG).length;

    console.log(`Total: ${docs.length} documents`);
    console.log(`Active for RAG: ${activeCount}`);
    console.log(`Inactive: ${inactiveCount}\n`);

    console.log('--- Active Documents (isActiveForRAG = true) ---');
    docs.filter(d => d.isActiveForRAG).forEach(doc => {
        console.log(`  ✅ ${doc.originalName}`);
    });

    console.log('\n--- Inactive Documents (isActiveForRAG = false) ---');
    docs.filter(d => !d.isActiveForRAG).slice(0, 10).forEach(doc => {
        console.log(`  ❌ ${doc.originalName}`);
    });
    if (inactiveCount > 10) {
        console.log(`  ... and ${inactiveCount - 10} more`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
