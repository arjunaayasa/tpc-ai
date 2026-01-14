const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Find all PP documents (approved or not)
    console.log('=== ALL PP Documents (any status) ===');
    const ppDocs = await prisma.document.findMany({
        where: {
            metadata: { jenis: 'PP' }
        },
        include: {
            metadata: true,
            _count: { select: { chunks: true } }
        }
    });

    console.log(`Total PP documents: ${ppDocs.length}`);
    for (const doc of ppDocs) {
        console.log(`${doc.metadata?.nomor}/${doc.metadata?.tahun}: ${doc._count.chunks} chunks, status=${doc.status}`);
        console.log(`  fileName: ${doc.originalName}`);
    }

    // Search by tahun 2016
    console.log('\n=== Documents with tahun 2016 ===');
    const docs2016 = await prisma.document.findMany({
        where: {
            metadata: { tahun: 2016 }
        },
        include: { metadata: true, _count: { select: { chunks: true } } }
    });

    for (const doc of docs2016) {
        console.log(`${doc.metadata?.jenis} ${doc.metadata?.nomor}/${doc.metadata?.tahun}: ${doc._count.chunks} chunks, status=${doc.status}`);
    }

    // Search by nomor 73
    console.log('\n=== Documents with nomor 73 ===');
    const docs73 = await prisma.document.findMany({
        where: {
            metadata: { nomor: '73' }
        },
        include: { metadata: true, _count: { select: { chunks: true } } }
    });

    console.log(`Found: ${docs73.length}`);
    for (const doc of docs73) {
        console.log(`${doc.metadata?.jenis} ${doc.metadata?.nomor}/${doc.metadata?.tahun}: ${doc._count.chunks} chunks, status=${doc.status}`);
    }

    // Search filename containing 73
    console.log('\n=== Documents with filename containing 73 ===');
    const docsFile73 = await prisma.document.findMany({
        where: {
            OR: [
                { fileName: { contains: '73' } },
                { originalName: { contains: '73' } }
            ]
        },
        include: { metadata: true }
    });

    for (const doc of docsFile73) {
        console.log(`${doc.originalName}: ${doc.metadata?.jenis} ${doc.metadata?.nomor}/${doc.metadata?.tahun}, status=${doc.status}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
