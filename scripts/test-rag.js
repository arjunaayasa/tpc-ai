// Test RAG retrieval and AI response from terminal
// Usage: node scripts/test-rag.js "your question here"

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Load environment variables
require('dotenv').config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const EMBEDDING_MODEL = 'text-embedding-3-small';

async function embedText(text) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            input: text,
            model: EMBEDDING_MODEL,
        }),
    });

    const data = await response.json();
    return data.data[0].embedding;
}

async function retrieve(question, topK = 30) {
    console.log(`\n[Retrieval] Query: "${question}"`);
    console.log(`[Retrieval] topK: ${topK}`);

    // Generate embedding for question
    const queryEmbedding = await embedText(question);
    console.log(`[Retrieval] Embedding generated, dimensions: ${queryEmbedding.length}`);

    // Perform similarity search
    const vectorString = `[${queryEmbedding.join(',')}]`;

    const results = await prisma.$queryRaw`
        SELECT 
            c.id,
            c."documentId",
            c."anchorCitation",
            c.pasal,
            c.ayat,
            c."chunkType",
            c.text,
            1 - (e.embedding <=> ${vectorString}::vector) as similarity
        FROM "ChunkEmbedding" e
        JOIN "RegulationChunk" c ON e."chunkId" = c.id
        ORDER BY e.embedding <=> ${vectorString}::vector
        LIMIT ${topK}
    `;

    console.log(`[Retrieval] Found ${results.length} chunks\n`);

    // Show results
    console.log('=== Retrieved Chunks ===\n');
    results.forEach((r, i) => {
        console.log(`${i + 1}. [${(r.similarity * 100).toFixed(1)}%] ${r.anchorCitation}`);
        console.log(`   Pasal: ${r.pasal || '-'}, Ayat: ${r.ayat || '-'}, Type: ${r.chunkType}`);
        console.log(`   Text: ${r.text.substring(0, 100).replace(/\n/g, ' ')}...\n`);
    });

    return results;
}

async function askDeepSeek(question, chunks) {
    console.log('\n=== Calling DeepSeek Reasoner (owlie-max) ===\n');

    // Build context from chunks
    const context = chunks.map((c, i) => {
        const label = `[C${i + 1}]`;
        return `${label} ${c.anchorCitation}\n${c.text}`;
    }).join('\n\n---\n\n');

    const systemPrompt = `Anda adalah TPC AI (Owlie), asisten perpajakan Indonesia yang ahli.
Jawab pertanyaan berdasarkan konteks yang diberikan.
Gunakan citation format [C1], [C2], dst untuk merujuk sumber.
Jawab dalam Bahasa Indonesia yang jelas dan terstruktur.`;

    const userPrompt = `KONTEKS REGULASI:
${context}

PERTANYAAN:
${question}`;

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'deepseek-reasoner',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 8192,
            stream: false
        }),
    });

    const data = await response.json();

    if (data.error) {
        console.error('DeepSeek Error:', data.error);
        return;
    }

    const choice = data.choices[0];

    console.log('--- Thinking/Reasoning ---');
    if (choice.message.reasoning_content) {
        console.log(choice.message.reasoning_content.substring(0, 500) + '...\n');
    }

    console.log('--- Answer ---');
    console.log(choice.message.content || '(no content)');

    console.log('\n--- Usage ---');
    console.log(`Prompt tokens: ${data.usage.prompt_tokens}`);
    console.log(`Completion tokens: ${data.usage.completion_tokens}`);
    console.log(`Total tokens: ${data.usage.total_tokens}`);
}

async function main() {
    const question = process.argv[2] || 'Apa isi Pasal 1 dari PER-17/PJ/2025?';

    console.log('================================================');
    console.log('  RAG Test - DeepSeek Reasoner (owlie-max)');
    console.log('================================================');

    try {
        const chunks = await retrieve(question, 30);
        await askDeepSeek(question, chunks);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
