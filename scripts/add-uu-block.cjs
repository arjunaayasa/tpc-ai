const fs = require('fs');
const file = 'src/worker/worker.ts';
let content = fs.readFileSync(file, 'utf8');

const uuBlock = `
        } else if (isUU) {
            // UU: use specialized UU extractor (same structure as PERPU)
            console.log(\`[Worker] Processing as UU document\`);

            // Parse UU
            const uuResult = parseUu(fullText);
            console.log(\`[Worker] UU parsed: \${uuResult.chunks.length} chunks, identity: \${JSON.stringify(uuResult.identity)}\`);

            // Convert date strings to Date objects if present
            let tanggalTerbit: Date | null = null;
            if (uuResult.identity.tanggalDitetapkan) {
                try {
                    const dateStr = uuResult.identity.tanggalDitetapkan;
                    const months: Record<string, number> = {
                        'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
                        'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
                    };
                    const match = dateStr.match(/(\\d+)\\s+(\\w+)\\s+(\\d{4})/);
                    if (match) {
                        const day = parseInt(match[1], 10);
                        const month = months[match[2].toLowerCase()];
                        const year = parseInt(match[3], 10);
                        if (month !== undefined) {
                            tanggalTerbit = new Date(year, month, day);
                        }
                    }
                } catch (e) {
                    console.warn(\`[Worker] Failed to parse UU tanggalDitetapkan: \${e}\`);
                }
            }

            // Upsert metadata with UU info
            await prisma.documentMetadata.upsert({
                where: { documentId },
                create: {
                    documentId,
                    jenis: 'UU',
                    nomor: uuResult.identity.nomor ?? null,
                    tahun: uuResult.identity.tahun ?? null,
                    judul: uuResult.identity.tentang ?? null,
                    tanggalTerbit,
                    statusAturan: 'berlaku',
                    documentSubtype: 'UNKNOWN',
                    confidence: extracted.confidence,
                    extractionNotes: {
                        hasPenjelasan: uuResult.chunks.some(c => c.sourcePart === 'PENJELASAN'),
                    },
                },
                update: {
                    jenis: 'UU',
                    nomor: uuResult.identity.nomor ?? null,
                    tahun: uuResult.identity.tahun ?? null,
                    judul: uuResult.identity.tentang ?? null,
                    tanggalTerbit,
                    confidence: extracted.confidence,
                    extractionNotes: {
                        hasPenjelasan: uuResult.chunks.some(c => c.sourcePart === 'PENJELASAN'),
                    },
                },
            });

            // Delete old chunks
            await prisma.regulationChunk.deleteMany({
                where: { documentId },
            });
            console.log(\`[Worker] Deleted old chunks\`);

            // Insert UU chunks
            if (uuResult.chunks.length > 0) {
                const chunkData = uuResult.chunks.map(chunk => {
                    const dbChunk = uuChunkToDbFormat(chunk, documentId);
                    return {
                        documentId,
                        anchorCitation: dbChunk.anchorCitation,
                        pasal: dbChunk.pasal,
                        ayat: dbChunk.ayat,
                        huruf: dbChunk.huruf,
                        chunkType: dbChunk.chunkType,
                        role: 'UNKNOWN' as const,
                        title: dbChunk.title,
                        orderIndex: dbChunk.orderIndex,
                        text: dbChunk.text,
                        tokenEstimate: dbChunk.tokenEstimate,
                    };
                });

                await prisma.regulationChunk.createMany({
                    data: chunkData,
                });
                console.log(\`[Worker] Inserted \${uuResult.chunks.length} UU chunks\`);

                // Log chunk types breakdown
                console.log(\`[Worker] UU chunk types breakdown:\`);
                const typeCounts = uuResult.chunks.reduce((acc, c) => {
                    const key = \`\${c.sourcePart}:\${c.chunkType}\`;
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);
                Object.entries(typeCounts).forEach(([type, count]) => {
                    console.log(\`[Worker]   - \${type}: \${count}\`);
                });
            }

            // Extract tables using Qwen AI
            try {
                console.log(\`[Worker] Extracting tables from UU using Qwen AI...\`);
                const tableResult = await extractTablesFromText(fullText, \`UU \${uuResult.identity.nomor || 'Unknown'}/\${uuResult.identity.tahun || 'YYYY'}\`);

                if (tableResult.tables.length > 0) {
                    await prisma.documentTable.deleteMany({
                        where: { documentId },
                    });

                    await prisma.documentTable.createMany({
                        data: tableResult.tables.map((table, idx) => ({
                            documentId,
                            title: table.title,
                            pageContext: table.pageContext ?? null,
                            headers: table.headers,
                            rows: table.rows,
                            notes: table.notes ?? null,
                            orderIndex: idx,
                        })),
                    });
                    console.log(\`[Worker] Inserted \${tableResult.tables.length} tables from UU\`);
                } else {
                    console.log(\`[Worker] No tables found in UU\`);
                }
            } catch (tableError) {
                console.error(\`[Worker] Table extraction failed (non-critical):\`, tableError);
            }`;

// Find the pattern: "} else if (isSE) {"
const sePattern = /(\s*\} else if \(isSE\) \{)/;

if (sePattern.test(content)) {
    content = content.replace(sePattern, uuBlock + '\n        } else if (isSE) {');
    fs.writeFileSync(file, content);
    console.log('Successfully added UU block before SE block in worker.ts');
} else {
    console.error('Could not find isSE pattern in worker.ts');
}
