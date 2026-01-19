const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetFile = '90007_005092.15.2023w.pdf';

    console.log(`Disabling all documents for RAG except: ${targetFile}`);

    // Update all except target
    const result = await prisma.document.updateMany({
        where: {
            originalName: {
                not: targetFile
            },
            isActiveForRAG: true
        },
        data: {
            isActiveForRAG: false
        }
    });

    console.log(`Updated ${result.count} documents to inactive.`);

    // Ensure target is active
    const target = await prisma.document.findFirst({
        where: { originalName: targetFile }
    });

    if (target) {
        if (!target.isActiveForRAG) {
            await prisma.document.update({
                where: { id: target.id },
                data: { isActiveForRAG: true }
            });
            console.log(`Set ${targetFile} to Active.`);
        } else {
            console.log(`${targetFile} is already Active.`);
        }
    } else {
        console.error(`Warning: Target file ${targetFile} not found!`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
