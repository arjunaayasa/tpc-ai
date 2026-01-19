/**
 * Benchmark Testing System for Advanced RAG
 * Compares AI answers against verified ground truth from regulations
 */

import 'dotenv/config';
import { answerWithAdvancedRAG } from '../src/lib/rag/orchestrator';

// ============== GROUND TRUTH TEST CASES ==============

interface TestCase {
    id: string;
    question: string;
    category: string;
    groundTruth: {
        keyFacts: string[];          // Must be present in answer
        keyNumbers: string[];        // Specific numbers that must be correct
        mustCiteSources: string[];   // Sources that should be cited
        mustNotContain: string[];    // Things that indicate hallucination
    };
    source: string;                   // Regulation/source reference
}

const TEST_CASES: TestCase[] = [
    // ============ PPh 21 TER =============
    {
        id: 'PPH21-TER-001',
        question: 'Berapa tarif PPh 21?',
        category: 'PPh 21',
        groundTruth: {
            keyFacts: [
                'TER',                    // Must mention TER
                'tarif efektif',          // Must mention effective rate
                'tarif progresif',        // Must mention progressive rate
                'Pasal 17',               // Must reference Pasal 17
                'PP 58/2023',             // Must cite regulation
            ],
            keyNumbers: [
                '5%',                     // First bracket of progressive
                '15%',                    // Second bracket
                '25%',                    // Third bracket
                '30%',                    // Fourth bracket
                '35%',                    // Fifth bracket (HPP)
            ],
            mustCiteSources: ['PP 58', 'PMK'],
            mustNotContain: [
                'UU 1/2014',              // Pesisir - wrong domain
                'UU Pesisir',             // Wrong domain
            ],
        },
        source: 'PP 58/2023, UU PPh Pasal 17'
    },

    // ============ TER KATEGORI =============
    {
        id: 'PPH21-TER-002',
        question: 'Apa saja kategori TER PPh 21?',
        category: 'PPh 21',
        groundTruth: {
            keyFacts: [
                'Kategori A',
                'Kategori B',
                'Kategori C',
                'TK/0',                   // Not married no dependents
                'K/0',                    // Married no dependents
                'PTKP',
            ],
            keyNumbers: [],
            mustCiteSources: ['PP 58'],
            mustNotContain: [],
        },
        source: 'PP 58/2023 Lampiran'
    },

    // ============ PTKP =============
    {
        id: 'PTKP-001',
        question: 'Berapa PTKP tahun 2024?',
        category: 'PTKP',
        groundTruth: {
            keyFacts: [
                'TK/0',
                'K/0',
                'tanggungan',
                'PMK',
            ],
            keyNumbers: [
                '54.000.000',             // TK/0 per year
                '58.500.000',             // TK/1 or K/0
                '4.500.000',              // Per tanggungan
            ],
            mustCiteSources: ['PMK'],
            mustNotContain: [],
        },
        source: 'PMK 101/PMK.010/2016'
    },

    // ============ Tarif Progresif PPh =============
    {
        id: 'PPH-PROGRESIF-001',
        question: 'Jelaskan tarif progresif PPh Pasal 17',
        category: 'PPh',
        groundTruth: {
            keyFacts: [
                'Pasal 17',
                'progresif',
                'lapisan',
                'penghasilan kena pajak',
            ],
            keyNumbers: [
                '60.000.000',             // First bracket limit
                '250.000.000',            // Second bracket limit  
                '500.000.000',            // Third bracket limit
                '5.000.000.000',          // Fourth bracket limit
                '5%',
                '15%',
                '25%',
                '30%',
                '35%',
            ],
            mustCiteSources: ['UU'],
            mustNotContain: [],
        },
        source: 'UU PPh Pasal 17 ayat (1) huruf a (pasca UU HPP)'
    },

    // ============ PPN =============
    {
        id: 'PPN-001',
        question: 'Berapa tarif PPN?',
        category: 'PPN',
        groundTruth: {
            keyFacts: [
                'PPN',
                'UU HPP',
            ],
            keyNumbers: [
                '11%',                    // Current rate
                '12%',                    // Rate from Jan 2025
            ],
            mustCiteSources: ['UU'],
            mustNotContain: [],
        },
        source: 'UU 7/2021 (UU HPP) Pasal 7'
    },

    // ============ NPWP =============
    {
        id: 'PPH21-NPWP-001',
        question: 'Bagaimana jika karyawan tidak punya NPWP?',
        category: 'PPh 21',
        groundTruth: {
            keyFacts: [
                'NPWP',
                'lebih tinggi',
                '20%',
            ],
            keyNumbers: [
                '20%',                    // Higher rate for no NPWP
            ],
            mustCiteSources: ['PMK', 'UU'],
            mustNotContain: [],
        },
        source: 'UU PPh Pasal 21 ayat (5a)'
    },

    // ============ PPh Final UMKM =============
    {
        id: 'UMKM-001',
        question: 'Berapa tarif PPh Final untuk UMKM?',
        category: 'PPh Final',
        groundTruth: {
            keyFacts: [
                '0,5%',
                'setengah persen',
                'peredaran bruto',
                'PP 55',
            ],
            keyNumbers: [
                '0,5%',
                '0.5%',
            ],
            mustCiteSources: ['PP 55'],
            mustNotContain: ['1%'], // Old rate PP 23 or PP 46
        },
        source: 'PP 55 Tahun 2022'
    },

    // ============ KUP (Sanksi) =============
    {
        id: 'KUP-SANKSI-001',
        question: 'Apa sanksi denda jika telat lapor SPT Tahunan Orang Pribadi?',
        category: 'KUP',
        groundTruth: {
            keyFacts: [
                '100.000',
                'seratus ribu',
                'denda',
                'administrasi',
            ],
            keyNumbers: [
                '100.000',
            ],
            mustCiteSources: ['UU KUP', 'Pasal 7'],
            mustNotContain: [],
        },
        source: 'UU KUP Pasal 7 ayat (1)'
    },

    // ============ PKP Threshold =============
    {
        id: 'PPN-PKP-001',
        question: 'Berapa batasan omzet untuk wajib dikukuhkan sebagai PKP?',
        category: 'PPN',
        groundTruth: {
            keyFacts: [
                '4,8 Miliar',
                '4.8 Miliar',
                'pengusaha kena pajak',
            ],
            keyNumbers: [
                '4.800.000.000',
                '4,8 M',
            ],
            mustCiteSources: ['PMK 197'],
            mustNotContain: ['600 juta'], // Very old rule
        },
        source: 'PMK 197/PMK.03/2013'
    },

    // ============ Natura =============
    {
        id: 'PPH-NATURA-001',
        question: 'Apakah fasilitas kantor atau natura dikenakan pajak?',
        category: 'PPh',
        groundTruth: {
            keyFacts: [
                'objek pajak',
                'dikecualikan',
                'kenikmatan',
                'PMK 66',
            ],
            keyNumbers: [],
            mustCiteSources: ['PMK 66', 'UU HPP'],
            mustNotContain: [],
        },
        source: 'PMK 66 Tahun 2023, UU HPP'
    },

    // ============ PPh Badan =============
    {
        id: 'PPH-BADAN-001',
        question: 'Berapa tarif PPh Badan yang berlaku saat ini?',
        category: 'PPh Badan',
        groundTruth: {
            keyFacts: [
                '22%',
                'badan dalam negeri',
                'bentuk usaha tetap',
            ],
            keyNumbers: [
                '22%',
            ],
            mustCiteSources: ['UU HPP', 'UU PPh'],
            mustNotContain: ['25%', '20%'], // Old rates
        },
        source: 'UU HPP Pasal 17'
    },
];

// ============== EVALUATION FUNCTIONS ==============

interface EvaluationResult {
    testId: string;
    question: string;
    category: string;
    passed: boolean;
    score: number;
    details: {
        keyFactsFound: { fact: string; found: boolean }[];
        keyNumbersFound: { number: string; found: boolean }[];
        sourcesFound: { source: string; found: boolean }[];
        hallucinations: { term: string; found: boolean }[];
    };
    processingTimeMs: number;
    answerLength: number;
    citations: string[];
}

function evaluateAnswer(testCase: TestCase, answer: string): Omit<EvaluationResult, 'processingTimeMs' | 'answerLength' | 'citations'> {
    const lowerAnswer = answer.toLowerCase();

    // Check key facts
    const keyFactsFound = testCase.groundTruth.keyFacts.map(fact => ({
        fact,
        found: lowerAnswer.includes(fact.toLowerCase())
    }));

    // Check key numbers
    const keyNumbersFound = testCase.groundTruth.keyNumbers.map(num => {
        // Handle different number formats (with/without dots, percentage)
        const cleanNum = num.replace(/[.%]/g, '');
        const variants = [
            num,
            num.replace(/\./g, ','),
            cleanNum,
            // Add variants for Rp formats
            `Rp${num}`,
            `Rp ${num}`,
        ];
        return {
            number: num,
            found: variants.some(v => lowerAnswer.includes(v.toLowerCase()))
        };
    });

    // Check source citations
    const sourcesFound = testCase.groundTruth.mustCiteSources.map(source => ({
        source,
        found: lowerAnswer.includes(source.toLowerCase())
    }));

    // Check for hallucinations
    const hallucinations = testCase.groundTruth.mustNotContain.map(term => ({
        term,
        found: lowerAnswer.includes(term.toLowerCase())
    }));

    // Calculate score
    const factScore = keyFactsFound.filter(f => f.found).length / Math.max(keyFactsFound.length, 1);
    const numberScore = keyNumbersFound.filter(n => n.found).length / Math.max(keyNumbersFound.length, 1);
    const sourceScore = sourcesFound.filter(s => s.found).length / Math.max(sourcesFound.length, 1);
    const hallucinationPenalty = hallucinations.filter(h => h.found).length * 0.2;

    const score = Math.max(0, (factScore * 0.4 + numberScore * 0.3 + sourceScore * 0.3) - hallucinationPenalty);

    const passed = score >= 0.6 && hallucinations.filter(h => h.found).length === 0;

    return {
        testId: testCase.id,
        question: testCase.question,
        category: testCase.category,
        passed,
        score,
        details: {
            keyFactsFound,
            keyNumbersFound,
            sourcesFound,
            hallucinations
        }
    };
}

function extractCitations(answer: string): string[] {
    const citations: string[] = [];
    const regex = /\[(?:C|TR|S)(\d+)\]/g;
    let match;
    while ((match = regex.exec(answer)) !== null) {
        citations.push(match[0]);
    }
    return [...new Set(citations)];
}

// ============== MAIN BENCHMARK FUNCTION ==============

async function runBenchmark(testCases: TestCase[] = TEST_CASES): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 BENCHMARK TESTING - Advanced RAG System');
    console.log('='.repeat(80));
    console.log(`Running ${testCases.length} test cases...\n`);

    const results: EvaluationResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`📋 Test: ${testCase.id}`);
        console.log(`❓ Question: ${testCase.question}`);
        console.log(`📂 Category: ${testCase.category}`);
        console.log('─'.repeat(60));

        const startTime = Date.now();

        try {
            const ragResult = await answerWithAdvancedRAG(testCase.question);
            const processingTime = Date.now() - startTime;

            const evaluation = evaluateAnswer(testCase, ragResult.answer);
            const citations = extractCitations(ragResult.answer);

            const result: EvaluationResult = {
                ...evaluation,
                processingTimeMs: processingTime,
                answerLength: ragResult.answer.length,
                citations
            };

            results.push(result);

            if (result.passed) {
                passed++;
                console.log(`✅ PASSED (Score: ${(result.score * 100).toFixed(1)}%)`);
            } else {
                failed++;
                console.log(`❌ FAILED (Score: ${(result.score * 100).toFixed(1)}%)`);
            }

            // Print details
            console.log(`\n📊 Details:`);
            console.log(`   Time: ${processingTime}ms | Answer Length: ${result.answerLength} chars`);
            console.log(`   Citations: ${citations.join(', ') || 'None'}`);

            // Print what was found/missing
            const missingFacts = result.details.keyFactsFound.filter(f => !f.found);
            const missingNumbers = result.details.keyNumbersFound.filter(n => !n.found);
            const missingSources = result.details.sourcesFound.filter(s => !s.found);
            const foundHallucinations = result.details.hallucinations.filter(h => h.found);

            if (missingFacts.length > 0) {
                console.log(`   ⚠️  Missing facts: ${missingFacts.map(f => f.fact).join(', ')}`);
            }
            if (missingNumbers.length > 0) {
                console.log(`   ⚠️  Missing numbers: ${missingNumbers.map(n => n.number).join(', ')}`);
            }
            if (missingSources.length > 0) {
                console.log(`   ⚠️  Missing sources: ${missingSources.map(s => s.source).join(', ')}`);
            }
            if (foundHallucinations.length > 0) {
                console.log(`   🚨 HALLUCINATION DETECTED: ${foundHallucinations.map(h => h.term).join(', ')}`);
            }

            // Save full answer to file for clean verification
            const fs = require('fs');
            fs.writeFileSync('last_benchmark_answer.txt', ragResult.answer);

            // Print full answer for inspection
            console.log(`\n📝 Full Answer saved to last_benchmark_answer.txt`);

        } catch (error) {
            failed++;
            console.log(`❌ ERROR: ${(error as Error).message}`);
            results.push({
                testId: testCase.id,
                question: testCase.question,
                category: testCase.category,
                passed: false,
                score: 0,
                details: {
                    keyFactsFound: [],
                    keyNumbersFound: [],
                    sourcesFound: [],
                    hallucinations: []
                },
                processingTimeMs: Date.now() - startTime,
                answerLength: 0,
                citations: []
            });
        }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📈 BENCHMARK SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${testCases.length}`);
    console.log(`✅ Passed: ${passed} (${((passed / testCases.length) * 100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${failed} (${((failed / testCases.length) * 100).toFixed(1)}%)`);

    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const avgTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0) / results.length;

    console.log(`\n📊 Average Score: ${(avgScore * 100).toFixed(1)}%`);
    console.log(`⏱️  Average Processing Time: ${(avgTime / 1000).toFixed(1)}s`);

    // Category breakdown
    console.log('\n📂 By Category:');
    const categories = [...new Set(testCases.map(t => t.category))];
    for (const cat of categories) {
        const catResults = results.filter(r => r.category === cat);
        const catPassed = catResults.filter(r => r.passed).length;
        const catScore = catResults.reduce((sum, r) => sum + r.score, 0) / catResults.length;
        console.log(`   ${cat}: ${catPassed}/${catResults.length} passed (${(catScore * 100).toFixed(1)}%)`);
    }

    console.log('\n' + '='.repeat(80));
}

// ============== RUN ==============

const args = process.argv.slice(2);
const testId = args[0];

if (testId) {
    const testCase = TEST_CASES.find(t => t.id === testId);
    if (testCase) {
        runBenchmark([testCase]).catch(console.error);
    } else {
        console.log(`Test case "${testId}" not found. Available: ${TEST_CASES.map(t => t.id).join(', ')}`);
    }
} else {
    runBenchmark().catch(console.error);
}
