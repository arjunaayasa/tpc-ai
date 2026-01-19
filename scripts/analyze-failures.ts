/**
 * Analyze failing benchmark test cases
 * Check if required regulations exist in RAG database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeFailingTests() {
    console.log('='.repeat(60));
    console.log('ANALYZING FAILING BENCHMARK TEST CASES');
    console.log('='.repeat(60));

    // Test 1: PTKP-001 - Check for PMK 101/2016 or PTKP content
    console.log('\n--- TEST: PTKP-001 ---');
    console.log('Required: PMK 101/PMK.010/2016 (PTKP values)');

    const ptkpDocs = await prisma.documentMetadata.findMany({
        where: {
            OR: [
                { AND: [{ nomor: { contains: '101' } }, { jenis: 'PMK' }] },
                { judul: { contains: 'PTKP' } },
                { judul: { contains: 'Penghasilan Tidak Kena Pajak' } }
            ]
        },
        select: { id: true, jenis: true, nomor: true, tahun: true, judul: true }
    });
    console.log('Found documents:', ptkpDocs.length);
    ptkpDocs.forEach(d => console.log('  -', d.jenis, d.nomor + '/' + d.tahun, '-', d.judul?.substring(0, 50)));

    const ptkpChunks = await prisma.regulationChunk.count({
        where: { text: { contains: 'PTKP' } }
    });
    console.log('Found chunks with "PTKP":', ptkpChunks);

    // Test 2: PPN-PKP-001 - Check for PMK 197/2013 or PKP threshold
    console.log('\n--- TEST: PPN-PKP-001 ---');
    console.log('Required: PMK 197/PMK.03/2013 (PKP threshold 4.8 Miliar)');

    const pkpDocs = await prisma.documentMetadata.findMany({
        where: {
            OR: [
                { AND: [{ nomor: { contains: '197' } }, { jenis: 'PMK' }] },
                { judul: { contains: 'PKP' } },
                { judul: { contains: 'Pengusaha Kena Pajak' } }
            ]
        },
        select: { id: true, jenis: true, nomor: true, tahun: true, judul: true }
    });
    console.log('Found documents:', pkpDocs.length);
    pkpDocs.forEach(d => console.log('  -', d.jenis, d.nomor + '/' + d.tahun, '-', d.judul?.substring(0, 50)));

    const pkpChunks = await prisma.regulationChunk.count({
        where: { text: { contains: '4.800.000.000' } }
    });
    console.log('Found chunks with "4.800.000.000":', pkpChunks);

    const pkpChunks2 = await prisma.regulationChunk.count({
        where: { text: { contains: 'Pengusaha Kena Pajak' } }
    });
    console.log('Found chunks with "Pengusaha Kena Pajak":', pkpChunks2);

    // Test 3: PPH-NATURA-001 - Check for PMK 66/2023 or Natura content
    console.log('\n--- TEST: PPH-NATURA-001 ---');
    console.log('Required: PMK 66 Tahun 2023 (Natura/Kenikmatan)');

    const naturaDocs = await prisma.documentMetadata.findMany({
        where: {
            OR: [
                { AND: [{ nomor: { contains: '66' } }, { jenis: 'PMK' }] },
                { judul: { contains: 'natura' } },
                { judul: { contains: 'kenikmatan' } }
            ]
        },
        select: { id: true, jenis: true, nomor: true, tahun: true, judul: true }
    });
    console.log('Found documents:', naturaDocs.length);
    naturaDocs.forEach(d => console.log('  -', d.jenis, d.nomor + '/' + d.tahun, '-', d.judul?.substring(0, 50)));

    const naturaChunks = await prisma.regulationChunk.count({
        where: { text: { contains: 'natura' } }
    });
    console.log('Found chunks with "natura":', naturaChunks);

    const kenikmatanChunks = await prisma.regulationChunk.count({
        where: { text: { contains: 'kenikmatan' } }
    });
    console.log('Found chunks with "kenikmatan":', kenikmatanChunks);

    // Summary of all PMK documents in database
    console.log('\n--- ALL PMK DOCUMENTS IN DATABASE ---');
    const allPmk = await prisma.documentMetadata.findMany({
        where: { jenis: 'PMK' },
        select: { nomor: true, tahun: true, judul: true },
        orderBy: { tahun: 'desc' }
    });
    console.log('Total PMK documents:', allPmk.length);
    allPmk.slice(0, 15).forEach(d => console.log('  -', d.nomor + '/' + d.tahun, '-', d.judul?.substring(0, 40)));
    if (allPmk.length > 15) console.log('  ... and', allPmk.length - 15, 'more');

    console.log('\n' + '='.repeat(60));
    console.log('CONCLUSION:');
    console.log('- If documents not found: Need to ingest the regulation');
    console.log('- If chunks not found: Need to re-chunk or improve indexing');
    console.log('='.repeat(60));
}

analyzeFailingTests()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
