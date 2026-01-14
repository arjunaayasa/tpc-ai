const fs = require('fs');
const file = 'src/worker/worker.ts';
let content = fs.readFileSync(file, 'utf8');

// Find and replace the createMany data line for UU chunks
content = content.replace(
    /await prisma\.regulationChunk\.createMany\(\{\s*\n\s*data: chunkData,\s*\n\s*\}\);(\s*\n\s*console\.log\(`\[Worker\] Inserted \$\{uuResult\.chunks\.length\} UU chunks`\))/,
    `await prisma.regulationChunk.createMany({
                    data: chunkData as any,
                });$1`
);

fs.writeFileSync(file, content);
console.log('Fixed chunkData casting for UU extractor');
