/**
 * Unit tests for Putusan Extractor
 * Run with: npx ts-node --esm src/lib/extractors/putusanExtractor.test.ts
 */

import {
    parsePutusan,
    cleanPutusanText,
    extractPutusanIdentity,
    PutusanParseResult,
} from './putusanExtractor';

// Sample putusan text for testing
const SAMPLE_PUTUSAN_TEXT = `
PUTUSAN
Nomor PUT-123456/PP/M.XIIIA/15/2024

DEMI KEADILAN BERDASARKAN KETUHANAN YANG MAHA ESA

PENGADILAN PAJAK

memeriksa dan memutus sengketa pajak pada tingkat pertama dan terakhir dengan Acara Biasa

Telah membaca Surat Banding Nomor S-123/WP/2024
Telah membaca Surat Uraian Banding dari Terbanding
Telah mendengar keterangan para pihak

DUDUK PERKARA

Menimbang, bahwa sengketa pajak ini timbul karena adanya koreksi yang dilakukan oleh Terbanding
atas Penghasilan Kena Pajak Tahun 2022.

Menimbang, bahwa Pemohon Banding dalam Surat Bandingnya menyatakan keberatan atas koreksi tersebut.

I. POKOK SENGKETA

Bahwa yang menjadi pokok sengketa adalah koreksi atas Penghasilan dari Luar Usaha.

II. ALASAN BANDING

Bahwa Pemohon Banding tidak setuju dengan koreksi yang dilakukan oleh Terbanding.

Menimbang, bahwa Terbanding dalam Surat Uraian Banding menyatakan:

I. KETENTUAN FORMAL

Bahwa secara formal, Surat Banding telah memenuhi ketentuan Pasal 35 ayat (1) UU PP.

II. MATERI SENGKETA

Bahwa koreksi dilakukan berdasarkan hasil pemeriksaan.

Menimbang, bahwa Pemohon Banding dalam Surat Bantahan menyatakan tetap pada pendiriannya.

Bukti P-1. Fotokopi Surat Ketetapan Pajak
Bukti P-2. Fotokopi Surat Keberatan
Bukti P-3. Rekonsiliasi Penghasilan

Menimbang, bahwa berdasarkan pemeriksaan bukti-bukti yang diajukan, Majelis berpendapat:

bahwa koreksi yang dilakukan Terbanding sebagian dapat dipertahankan.

M E N G A D I L I :

Mengabulkan sebagian permohonan banding Pemohon Banding;

Membatalkan Keputusan Direktur Jenderal Pajak Nomor KEP-123/WPJ/2024;

Menetapkan pajak yang masih harus dibayar menjadi sebagai berikut:
- Penghasilan Kena Pajak: Rp 1.000.000.000
- PPh Terutang: Rp 250.000.000

Demikian diputus dalam rapat permusyawaratan Majelis.
`;

// Test utilities
function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

// Test cases
function testCleanPutusanText(): void {
    console.log('Testing cleanPutusanText...');
    
    const dirtyText = "Page 1\n\nPUTUSAN\n\n\n\n\nNomor 123\n\nHalaman 1 dari 10\n\n5\n\nContent here";
    const cleaned = cleanPutusanText(dirtyText);
    
    // Should remove page numbers
    assert(!cleaned.includes('\n5\n'), 'Should remove isolated page numbers');
    
    // Should remove repeated headers
    assert(!cleaned.includes('Halaman 1 dari 10'), 'Should remove page headers');
    
    // Should normalize multiple newlines
    assert(!cleaned.includes('\n\n\n\n'), 'Should normalize excessive newlines');
    
    console.log('✓ cleanPutusanText passed');
}

function testExtractPutusanIdentity(): void {
    console.log('Testing extractPutusanIdentity...');
    
    const identity = extractPutusanIdentity(SAMPLE_PUTUSAN_TEXT);
    
    assert(identity.nomor !== null, 'Should extract nomor');
    assert(identity.nomor!.includes('PUT-123456'), 'Nomor should contain PUT-123456');
    assertEquals(identity.tahun, 2024, 'Should extract year 2024');
    
    console.log('✓ extractPutusanIdentity passed');
}

function testParsePutusan(): void {
    console.log('Testing parsePutusan...');
    
    const result: PutusanParseResult = parsePutusan(SAMPLE_PUTUSAN_TEXT);
    
    // Test sections
    assert(result.sections.length > 0, 'Should have sections');
    console.log(`  Found ${result.sections.length} sections`);
    
    const sectionTypes = result.sections.map(s => s.type);
    console.log(`  Section types: ${sectionTypes.join(', ')}`);
    
    // Should have HEADER
    assert(sectionTypes.includes('HEADER'), 'Should have HEADER section');
    
    // Should have DUDUK_PERKARA
    assert(sectionTypes.includes('DUDUK_PERKARA'), 'Should have DUDUK_PERKARA section');
    
    // Should have AMAR
    assert(sectionTypes.includes('AMAR'), 'Should have AMAR section');
    
    // Test chunks
    assert(result.chunks.length > 0, 'Should have chunks');
    console.log(`  Found ${result.chunks.length} chunks`);
    
    const chunkTypes = [...new Set(result.chunks.map(c => c.chunkType))];
    console.log(`  Chunk types: ${chunkTypes.join(', ')}`);
    
    // Should have AMAR chunk
    const amarChunk = result.chunks.find(c => c.chunkType === 'AMAR');
    assert(amarChunk !== undefined, 'Should have AMAR chunk');
    assert(amarChunk!.role === 'MAJELIS', 'AMAR chunk should have MAJELIS role');
    
    // Test evidence items
    console.log(`  Found ${result.evidenceItems.length} evidence items`);
    
    if (result.evidenceItems.length > 0) {
        const codes = result.evidenceItems.map(e => e.code);
        console.log(`  Evidence codes: ${codes.join(', ')}`);
        
        assert(codes.includes('P-1'), 'Should find evidence P-1');
        assert(codes.includes('P-2'), 'Should find evidence P-2');
    }
    
    // Test identity
    assert(result.identity.nomor !== null, 'Should have identity nomor');
    
    console.log('✓ parsePutusan passed');
}

function testAnchorCitation(): void {
    console.log('Testing anchor citations...');
    
    const result = parsePutusan(SAMPLE_PUTUSAN_TEXT);
    
    // All chunks should have anchorCitation
    result.chunks.forEach((chunk, idx) => {
        assert(chunk.anchorCitation !== '', `Chunk ${idx} should have anchorCitation`);
        assert(chunk.anchorCitation.includes('PUTUSAN'), `Chunk ${idx} citation should include PUTUSAN`);
    });
    
    console.log('✓ Anchor citations passed');
}

function testRoleDetection(): void {
    console.log('Testing role detection...');
    
    const result = parsePutusan(SAMPLE_PUTUSAN_TEXT);
    
    const roles = [...new Set(result.chunks.map(c => c.role))];
    console.log(`  Found roles: ${roles.join(', ')}`);
    
    // Should detect multiple roles
    assert(roles.length > 1, 'Should detect multiple roles');
    
    console.log('✓ Role detection passed');
}

function testSubsections(): void {
    console.log('Testing subsection parsing...');
    
    const result = parsePutusan(SAMPLE_PUTUSAN_TEXT);
    
    const subsections = result.chunks.filter(c => c.chunkType === 'SUBSECTION');
    console.log(`  Found ${subsections.length} subsections`);
    
    // Should find roman numeral subsections
    if (subsections.length > 0) {
        const titles = subsections.map(s => s.title);
        console.log(`  Subsection titles: ${titles.join(', ')}`);
        
        // At least one should start with roman numeral
        const hasRoman = titles.some(t => t && /^(I|II|III|IV|V)\./.test(t));
        assert(hasRoman, 'Should have subsections with roman numerals');
    }
    
    console.log('✓ Subsection parsing passed');
}

function testTokenEstimate(): void {
    console.log('Testing token estimates...');
    
    const result = parsePutusan(SAMPLE_PUTUSAN_TEXT);
    
    // Most chunks should have positive token estimates
    const chunksWithTokens = result.chunks.filter(c => c.tokenEstimate > 0);
    const percentage = (chunksWithTokens.length / result.chunks.length) * 100;
    
    assert(percentage >= 80, `At least 80% of chunks should have positive token estimates, got ${percentage.toFixed(1)}%`);

    const totalTokens = result.chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);
    console.log(`  Total estimated tokens: ${totalTokens}`);
    console.log(`  Chunks with tokens: ${chunksWithTokens.length}/${result.chunks.length}`);
    
    console.log('✓ Token estimates passed');
}

// Run all tests
function runTests(): void {
    console.log('\n=== Running Putusan Extractor Tests ===\n');
    
    try {
        testCleanPutusanText();
        testExtractPutusanIdentity();
        testParsePutusan();
        testAnchorCitation();
        testRoleDetection();
        testSubsections();
        testTokenEstimate();
        
        console.log('\n=== All tests passed! ===\n');
    } catch (error) {
        console.error('\n❌ Test failed:', (error as Error).message);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
runTests();
