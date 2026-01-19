const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TARGET_FILES = [
    '90007_005092.15.2023w.pdf',
    '684 PUT-008746.152023PPM.IA Tahun 2025.pdf',
    '622 PUT-000130.152018PPM.XXB Tahun 2019.pdf',
    '15 PUT-001156.992022PPM.VIB Tahun 2025.pdf'
];

async function main() {
    console.log('=== Setting Specific Documents Active for RAG ===\n');

    // 1. Disable ALL first
    const disableResult = await prisma.document.updateMany({
        where: { isActiveForRAG: true },
        data: { isActiveForRAG: false }
    });
    console.log(`Disabled ${disableResult.count} documents.`);

    // 2. Enable specific files
    console.log('\nActivating target files:');
    let activatedCount = 0;

    for (const fileName of TARGET_FILES) {
        const doc = await prisma.document.findFirst({
            where: { originalName: fileName }
        });

        if (doc) {
            await prisma.document.update({
                where: { id: doc.id },
                data: { isActiveForRAG: true }
            });
            console.log(`✅ Activated: ${fileName}`);
            activatedCount++;
        } else {
            console.error(`❌ Not Found: ${fileName}`);
        }
    }

    console.log(`\nResult: ${activatedCount}/${TARGET_FILES.length} documents activated.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
