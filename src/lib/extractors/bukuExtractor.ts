/**
 * Buku (Book) Extractor
 * Simple, clean parsing for books - focuses on major headings only
 */

export type ChunkType = 'BAB' | 'SUBBAB' | 'SECTION';

export interface BukuChunk {
  anchorCitation: string;
  chunkType: ChunkType;
  title: string;
  text: string;
  orderIndex: number;
  tokenEstimate: number;
}

export interface BukuIdentity {
  judul: string | null;
  penulis: string | null;
  penerbit: string | null;
  tahun: number | null;
}

export interface BukuSection {
  type: 'BAB' | 'SUBBAB' | 'SECTION';
  title: string;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface BukuParseResult {
  identity: BukuIdentity;
  sections: BukuSection[];
  chunks: BukuChunk[];
}

// Target chunk size in characters (~500-750 tokens)
const TARGET_CHUNK_SIZE = 2500;
const MAX_CHUNK_SIZE = 4000;
const MIN_CHUNK_SIZE = 500;

/**
 * Estimate token count
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract book identity (title, author, publisher, year)
 */
export function extractBukuIdentity(text: string): BukuIdentity {
  const firstPage = text.slice(0, 4000);
  const lines = firstPage.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let judul: string | null = null;
  let penulis: string | null = null;
  let penerbit: string | null = null;
  let tahun: number | null = null;
  
  // Find title - first significant line that's not metadata
  for (const line of lines.slice(0, 15)) {
    if (/^(ISBN|Penerbit|Penulis|Copyright|Hak Cipta|\d{4}$|www\.|http)/i.test(line)) continue;
    if (line.length >= 10 && line.length <= 120) {
      judul = line;
      break;
    }
  }
  
  // Find author
  const penulisMatch = firstPage.match(/(?:Penulis|Oleh|Author|Disusun oleh)\s*[:]\s*([^\n]+)/i);
  if (penulisMatch) penulis = penulisMatch[1].trim();
  
  // Find publisher
  const penerbitMatch = firstPage.match(/(?:Penerbit|Publisher|Diterbitkan oleh)\s*[:]\s*([^\n]+)/i);
  if (penerbitMatch) penerbit = penerbitMatch[1].trim();
  
  // Find year
  const yearMatches = firstPage.match(/\b(20\d{2}|19\d{2})\b/g);
  if (yearMatches) {
    const years = yearMatches.map(y => parseInt(y, 10));
    tahun = Math.max(...years);
  }
  
  return { judul, penulis, penerbit, tahun };
}

/**
 * Find major headings only (BAB, BAGIAN, or numbered chapters)
 * More conservative - only clear structural markers
 */
function findMajorHeadings(text: string): Array<{ index: number; title: string }> {
  const headings: Array<{ index: number; title: string }> = [];
  
  // Pattern 1: BAB with number (Roman or Arabic)
  const babRegex = /^(BAB\s+(?:[IVXLCDM]+|\d+))\s*[:\.\-]?\s*([^\n]*)/gim;
  let match;
  while ((match = babRegex.exec(text)) !== null) {
    const title = match[2].trim() ? `${match[1]} - ${match[2].trim()}` : match[1];
    headings.push({ index: match.index, title });
  }
  
  // Pattern 2: BAGIAN with text
  const bagianRegex = /^(BAGIAN\s+(?:PERTAMA|KEDUA|KETIGA|KEEMPAT|KELIMA|KEENAM|KETUJUH|KEDELAPAN|KESEMBILAN|KESEPULUH|[IVXLCDM]+|\d+))\s*[:\.\-]?\s*([^\n]*)/gim;
  while ((match = bagianRegex.exec(text)) !== null) {
    const title = match[2].trim() ? `${match[1]} - ${match[2].trim()}` : match[1];
    headings.push({ index: match.index, title });
  }
  
  // Sort by position
  headings.sort((a, b) => a.index - b.index);
  
  return headings;
}

/**
 * Split text into semantic chunks at paragraph boundaries
 */
function splitIntoChunks(text: string, sectionTitle: string, startIndex: number): BukuChunk[] {
  const chunks: BukuChunk[] = [];
  
  // Split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  
  let currentChunk = '';
  let chunkNum = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    
    // If adding this paragraph exceeds max size, save current chunk
    if (currentChunk.length + para.length > TARGET_CHUNK_SIZE && currentChunk.length >= MIN_CHUNK_SIZE) {
      chunks.push({
        anchorCitation: chunkNum === 0 ? sectionTitle : `${sectionTitle} (lanjutan ${chunkNum})`,
        chunkType: 'SECTION',
        title: sectionTitle,
        text: currentChunk.trim(),
        orderIndex: startIndex + chunkNum,
        tokenEstimate: estimateTokens(currentChunk),
      });
      chunkNum++;
      currentChunk = '';
    }
    
    currentChunk += (currentChunk ? '\n\n' : '') + para;
    
    // Force split if too large
    if (currentChunk.length > MAX_CHUNK_SIZE) {
      chunks.push({
        anchorCitation: chunkNum === 0 ? sectionTitle : `${sectionTitle} (lanjutan ${chunkNum})`,
        chunkType: 'SECTION',
        title: sectionTitle,
        text: currentChunk.trim(),
        orderIndex: startIndex + chunkNum,
        tokenEstimate: estimateTokens(currentChunk),
      });
      chunkNum++;
      currentChunk = '';
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
    chunks.push({
      anchorCitation: chunkNum === 0 ? sectionTitle : `${sectionTitle} (lanjutan ${chunkNum})`,
      chunkType: 'SECTION',
      title: sectionTitle,
      text: currentChunk.trim(),
      orderIndex: startIndex + chunkNum,
      tokenEstimate: estimateTokens(currentChunk),
    });
  } else if (currentChunk.trim().length > 0 && chunks.length > 0) {
    // Append small remainder to last chunk
    const lastChunk = chunks[chunks.length - 1];
    lastChunk.text += '\n\n' + currentChunk.trim();
    lastChunk.tokenEstimate = estimateTokens(lastChunk.text);
  } else if (currentChunk.trim().length > 0) {
    // Single small chunk
    chunks.push({
      anchorCitation: sectionTitle,
      chunkType: 'SECTION',
      title: sectionTitle,
      text: currentChunk.trim(),
      orderIndex: startIndex,
      tokenEstimate: estimateTokens(currentChunk),
    });
  }
  
  return chunks;
}

/**
 * Parse book into sections and chunks
 */
export function parseBuku(text: string): BukuParseResult {
  const sections: BukuSection[] = [];
  const chunks: BukuChunk[] = [];
  
  // Extract identity
  const identity = extractBukuIdentity(text);
  console.log(`[BukuExtractor] Identity: ${identity.judul || 'Unknown'}`);
  
  // Find major headings
  const headings = findMajorHeadings(text);
  console.log(`[BukuExtractor] Found ${headings.length} major headings`);
  
  let chunkIndex = 0;
  
  if (headings.length >= 2) {
    // Process each section between headings
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const nextHeading = headings[i + 1];
      
      const startOffset = heading.index;
      const endOffset = nextHeading ? nextHeading.index : text.length;
      const sectionText = text.slice(startOffset, endOffset);
      
      // Create section record
      sections.push({
        type: 'BAB',
        title: heading.title,
        startOffset,
        endOffset,
        text: sectionText,
      });
      
      // Create chunks for this section
      const sectionChunks = splitIntoChunks(sectionText, heading.title, chunkIndex);
      
      // Update chunk type to BAB for first chunk
      if (sectionChunks.length > 0) {
        sectionChunks[0].chunkType = 'BAB';
      }
      
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }
  } else {
    // No clear headings - chunk the whole document by paragraphs
    console.log('[BukuExtractor] No clear headings, chunking by paragraphs');
    
    const title = identity.judul || 'Dokumen';
    const allChunks = splitIntoChunks(text, title, 0);
    chunks.push(...allChunks);
  }
  
  console.log(`[BukuExtractor] Created ${chunks.length} chunks`);
  
  return { identity, sections, chunks };
}

/**
 * Convert BukuChunk to database format
 */
export function bukuChunkToDbFormat(chunk: BukuChunk): {
  anchorCitation: string;
  chunkType: 'BAB' | 'SUBBAB' | 'SECTION';
  title: string;
  text: string;
  orderIndex: number;
  tokenEstimate: number;
} {
  return {
    anchorCitation: chunk.anchorCitation,
    chunkType: chunk.chunkType,
    title: chunk.title,
    text: chunk.text,
    orderIndex: chunk.orderIndex,
    tokenEstimate: chunk.tokenEstimate,
  };
}
