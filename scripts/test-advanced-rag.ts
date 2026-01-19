/**
 * Test script for Advanced RAG
 * Usage: npx tsx scripts/test-advanced-rag.ts "pertanyaan"
 */

import 'dotenv/config';
import { answerWithAdvancedRAG } from '../src/lib/rag';

async function main() {
    const question = process.argv[2] || 'Berapa tarif PPh 21 untuk penghasilan sampai Rp60 juta?';

    console.log('\n' + '='.repeat(70));
    console.log('🦉 Testing Advanced RAG System');
    console.log('='.repeat(70));
    console.log(`Question: "${question}"`);
    console.log('='.repeat(70) + '\n');

    try {
        const result = await answerWithAdvancedRAG(question);

        console.log('\n' + '='.repeat(70));
        console.log('📝 ANSWER:');
        console.log('='.repeat(70));
        console.log(result.answer);

        console.log('\n' + '='.repeat(70));
        console.log('📚 SOURCES:');
        console.log('='.repeat(70));
        for (const source of result.sources.slice(0, 5)) {
            console.log(`[${source.sid}] ${source.doc_type} - ${source.anchor}`);
        }

        console.log('\n' + '='.repeat(70));
        console.log('📊 METADATA:');
        console.log('='.repeat(70));
        console.log(`  Intent: ${result.metadata.plan.intent.join(', ')}`);
        console.log(`  Retrieval passes: ${result.metadata.retrieval_passes}`);
        console.log(`  Chunks retrieved: ${result.metadata.chunks_retrieved}`);
        console.log(`  After rerank: ${result.metadata.chunks_after_rerank}`);
        console.log(`  After expansion: ${result.metadata.chunks_after_expansion}`);
        console.log(`  Sufficiency checks: ${result.metadata.sufficiency_checks}`);
        console.log(`  Processing time: ${result.metadata.processing_time_ms}ms`);
        console.log('='.repeat(70) + '\n');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

main();
