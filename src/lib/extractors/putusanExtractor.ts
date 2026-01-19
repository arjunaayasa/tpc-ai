/**
 * Putusan (Tax Court Decision) Extractor
 * Regex-based segmentation for Indonesian Tax Court decisions
 */

export type SectionType =
  | 'HEADER'
  | 'RIWAYAT_PROSES'
  | 'DUDUK_PERKARA'
  | 'POSISI_PEMOHON'
  | 'POSISI_TERBANDING'
  | 'SURAT_BANTAHAN'
  | 'PEMBUKTIAN'
  | 'PERTIMBANGAN_MAJELIS'
  | 'AMAR';

export type ChunkType = 'SECTION' | 'SUBSECTION' | 'EVIDENCE' | 'AMAR';
export type ChunkRole = 'MAJELIS' | 'PEMOHON' | 'TERBANDING' | 'UNKNOWN';

export interface PutusanSection {
  type: SectionType;
  title: string;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface PutusanChunk {
  anchorCitation: string;
  chunkType: ChunkType;
  role: ChunkRole;
  title: string;
  text: string;
  orderIndex: number;
  parentId?: string;
  legalRefs?: string[];
  tokenEstimate: number;
}

export interface EvidenceItem {
  code: string; // e.g., "P-1"
  description: string;
  textRange: { start: number; end: number };
  mentionedInChunkIds: string[];
}

export interface PutusanTableRow {
  cells: string[];
}

export interface PutusanTable {
  title: string | null;
  headers: string[];
  rows: PutusanTableRow[];
  startOffset: number;
  endOffset: number;
}

export interface PutusanIdentity {
  nomor: string | null;
  tahun: number | null;
}

export interface PutusanParseResult {
  identity: PutusanIdentity;
  sections: PutusanSection[];
  chunks: PutusanChunk[];
  evidenceItems: EvidenceItem[];
  tables: PutusanTable[];
}

// ============== REGEX PATTERNS ==============

// Header patterns
const PUTUSAN_HEADER_REGEX = /^PUTUSAN\b/im;
const NOMOR_PUTUSAN_REGEX = /(?:Nomor|No\.?)\s*:?\s*(PUT[-.]\d+(?:[\/\-\.][^\s\/\n]+)*(?:\s*Tahun\s*\d{4})?|\d+[^\s\/\n]*)/im;
const DEMI_KEADILAN_REGEX = /DEMI\s+KEADILAN\s+BERDASARKAN\s+KETUHANAN\s+YANG\s+MAHA\s+ESA/im;
const PENGADILAN_PAJAK_REGEX = /PENGADILAN\s+PAJAK/im;

// Section heading patterns
const DUDUK_PERKARA_REGEX = /^DUDUK\s+PERKARA\b/im;
const MENGADILI_REGEX = /^M\s*E\s*N\s*G\s*A\s*D\s*I\s*L\s*I\s*:?\s*$/im;
const MEMPERHATIKAN_REGEX = /^Memperhatikan\b/im;

// Speaker block patterns
const MENIMBANG_PEMOHON_REGEX = /^Menimbang,?\s*(?:bahwa\s+)?(?:atas|sesuai)?\s*(?:permohonan\s+)?(?:Pemohon\s+Banding|Penggugat)\b/im;
const MENIMBANG_TERBANDING_REGEX = /^Menimbang,?\s*(?:bahwa\s+)?(?:atas|sesuai)?\s*(?:tanggapan\s+)?(?:Terbanding|Tergugat)\b/im;
const MENIMBANG_SURAT_BANTAHAN_REGEX = /^Menimbang,?\s*(?:bahwa\s+)?(?:Pemohon\s+Banding|Penggugat)\s+dalam\s+Surat\s+Bantahan\b/im;

// Roman numeral subsection pattern
const ROMAN_NUMERAL_REGEX = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+(.+)$/gm;

// Evidence list pattern
const BUKTI_REGEX = /^Bukti\s+(P-\d+[a-z]?)\.?\s*/gim;

// Riwayat proses pattern - lines with "Telah membaca", "Telah mendengar", etc.
const TELAH_REGEX = /^(?:(?:Telah\s+(?:membaca|mendengar|memeriksa|mempelajari))|(?:Setelah\s+(?:membaca|mendengar|memeriksa|mempelajari)))\b/im;

// Legal reference patterns (Pasal/Ayat references)
const PASAL_REF_REGEX = /Pasal\s+\d+(?:\s+ayat\s*\(\d+\))?/gi;

// Page number and header/footer cleanup
const PAGE_NUMBER_REGEX = /^\s*\d+\s*$/gm;
const REPEATED_HEADER_REGEX = /^(?:Halaman|hal\.?)\s*\d+\s*(?:dari|\/)\s*\d+/gim;

// ============== TEXT CLEANING ==============

/**
 * Clean raw text by removing page numbers, headers/footers
 */
export function cleanPutusanText(rawText: string): string {
  let text = rawText;

  // Normalize whitespace
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');

  // Remove isolated page numbers
  text = text.replace(PAGE_NUMBER_REGEX, '');

  // Remove repeated headers/footers with page numbers
  text = text.replace(REPEATED_HEADER_REGEX, '');

  // Remove multiple consecutive newlines (more than 2)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim lines
  text = text.split('\n').map(line => line.trimEnd()).join('\n');

  return text.trim();
}

// ============== IDENTITY EXTRACTION ==============

/**
 * Extract putusan number and year from header
 */
export function extractPutusanIdentity(text: string): PutusanIdentity {
  let nomor: string | null = null;
  let tahun: number | null = null;

  const nomorMatch = text.match(NOMOR_PUTUSAN_REGEX);
  if (nomorMatch) {
    nomor = nomorMatch[1].trim();

    // Try to extract year from nomor - look for /YYYY or Tahun YYYY pattern
    const yearInNomorMatch = nomor.match(/\/(\d{4})$|Tahun\s*(\d{4})/i);
    if (yearInNomorMatch) {
      tahun = parseInt(yearInNomorMatch[1] || yearInNomorMatch[2], 10);
    }
  }

  // If year not found in nomor, look for 4-digit year starting with 20 or 19 in first 500 chars
  // But avoid matching numbers in PUT-XXXXXX pattern
  if (!tahun) {
    // Look specifically for year patterns: /YYYY, Tahun YYYY, or standalone YYYY (20xx or 19xx)
    const yearPatterns = [
      /\/(\d{4})(?:\s|$)/,           // /2024
      /Tahun\s*(\d{4})/i,            // Tahun 2024
      /\b(20[0-2]\d)\b/,             // 2000-2029
      /\b(19[89]\d)\b/,              // 1980-1999
    ];

    const header = text.substring(0, 500);
    for (const pattern of yearPatterns) {
      const match = header.match(pattern);
      if (match) {
        const year = parseInt(match[1], 10);
        if (year >= 1980 && year <= 2100) {
          tahun = year;
          break;
        }
      }
    }
  }

  return { nomor, tahun };
}

// ============== SECTION DETECTION ==============

interface SectionBoundary {
  type: SectionType;
  title: string;
  startIndex: number;
}

/**
 * Find all section boundaries in the text
 */
function findSectionBoundaries(text: string): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [];

  // Header section (always at start)
  const demiKeadilanMatch = text.match(DEMI_KEADILAN_REGEX);
  if (demiKeadilanMatch) {
    boundaries.push({
      type: 'HEADER',
      title: 'Identitas Putusan',
      startIndex: 0,
    });
  }

  // Find DUDUK PERKARA
  const dudukMatch = text.match(DUDUK_PERKARA_REGEX);
  if (dudukMatch && dudukMatch.index !== undefined) {
    boundaries.push({
      type: 'DUDUK_PERKARA',
      title: 'Duduk Perkara',
      startIndex: dudukMatch.index,
    });
  }

  // Find speaker blocks - need to scan with multiline
  const lines = text.split('\n');
  let currentIndex = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for Menimbang Pemohon Banding
    if (MENIMBANG_PEMOHON_REGEX.test(trimmedLine)) {
      // Avoid duplicate if already found
      if (!boundaries.some(b => b.type === 'POSISI_PEMOHON' && Math.abs(b.startIndex - currentIndex) < 100)) {
        boundaries.push({
          type: 'POSISI_PEMOHON',
          title: 'Posisi Pemohon Banding',
          startIndex: currentIndex,
        });
      }
    }

    // Check for Menimbang Terbanding
    if (MENIMBANG_TERBANDING_REGEX.test(trimmedLine)) {
      if (!boundaries.some(b => b.type === 'POSISI_TERBANDING' && Math.abs(b.startIndex - currentIndex) < 100)) {
        boundaries.push({
          type: 'POSISI_TERBANDING',
          title: 'Posisi Terbanding',
          startIndex: currentIndex,
        });
      }
    }

    // Check for Surat Bantahan
    if (MENIMBANG_SURAT_BANTAHAN_REGEX.test(trimmedLine)) {
      if (!boundaries.some(b => b.type === 'SURAT_BANTAHAN' && Math.abs(b.startIndex - currentIndex) < 100)) {
        boundaries.push({
          type: 'SURAT_BANTAHAN',
          title: 'Surat Bantahan Pemohon',
          startIndex: currentIndex,
        });
      }
    }

    currentIndex += line.length + 1; // +1 for newline
  }

  // Find MENGADILI (Amar)
  const mengadiliMatch = text.match(MENGADILI_REGEX);
  if (mengadiliMatch && mengadiliMatch.index !== undefined) {
    boundaries.push({
      type: 'AMAR',
      title: 'Amar Putusan',
      startIndex: mengadiliMatch.index,
    });
  }

  // Sort by start index
  boundaries.sort((a, b) => a.startIndex - b.startIndex);

  return boundaries;
}

/**
 * Segment text into sections based on boundaries
 */
function segmentIntoSections(text: string, boundaries: SectionBoundary[]): PutusanSection[] {
  const sections: PutusanSection[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const current = boundaries[i];
    const next = boundaries[i + 1];

    const startOffset = current.startIndex;
    const endOffset = next ? next.startIndex : text.length;
    const sectionText = text.substring(startOffset, endOffset).trim();

    sections.push({
      type: current.type,
      title: current.title,
      startOffset,
      endOffset,
      text: sectionText,
    });
  }

  return sections;
}

// ============== SUBSECTION & EVIDENCE PARSING ==============

interface Subsection {
  numeral: string;
  title: string;
  text: string;
  startOffset: number;
}

/**
 * Parse roman numeral subsections within a section
 */
function parseSubsections(sectionText: string): Subsection[] {
  const subsections: Subsection[] = [];
  const regex = new RegExp(ROMAN_NUMERAL_REGEX.source, 'gm');

  const matches: { index: number; numeral: string; title: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sectionText)) !== null) {
    matches.push({
      index: match.index,
      numeral: match[1],
      title: match[2].trim(),
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];

    const startOffset = current.index;
    const endOffset = next ? next.index : sectionText.length;
    const text = sectionText.substring(startOffset, endOffset).trim();

    subsections.push({
      numeral: current.numeral,
      title: current.title,
      text,
      startOffset,
    });
  }

  return subsections;
}

/**
 * Parse evidence items (Bukti P-x) from section text
 */
function parseEvidenceItems(sectionText: string, baseOffset: number): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const regex = new RegExp(BUKTI_REGEX.source, 'gim');

  const matches: { index: number; code: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sectionText)) !== null) {
    matches.push({
      index: match.index,
      code: match[1],
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];

    const startOffset = current.index;
    const endOffset = next ? next.index : Math.min(startOffset + 500, sectionText.length); // Cap evidence description
    const description = sectionText.substring(startOffset, endOffset).trim();

    items.push({
      code: current.code,
      description: description.substring(0, 300), // Limit description length
      textRange: {
        start: baseOffset + startOffset,
        end: baseOffset + endOffset,
      },
      mentionedInChunkIds: [],
    });
  }

  return items;
}

/**
 * Extract legal references (Pasal/Ayat) from text
 */
function extractLegalRefs(text: string): string[] {
  const refs: string[] = [];
  const regex = new RegExp(PASAL_REF_REGEX.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const ref = match[0].trim();
    if (!refs.includes(ref)) {
      refs.push(ref);
    }
  }

  return refs;
}

// ============== TOKEN ESTIMATION ==============

function estimateTokens(text: string): number {
  // Rough estimation: ~4 chars per token for Indonesian
  return Math.ceil(text.length / 4);
}

// ============== CHUNK GENERATION ==============

function determineRole(sectionType: SectionType): ChunkRole {
  switch (sectionType) {
    case 'POSISI_PEMOHON':
    case 'SURAT_BANTAHAN':
      return 'PEMOHON';
    case 'POSISI_TERBANDING':
      return 'TERBANDING';
    case 'PERTIMBANGAN_MAJELIS':
    case 'AMAR':
      return 'MAJELIS';
    default:
      return 'UNKNOWN';
  }
}

function generateAnchorCitation(
  identity: PutusanIdentity,
  sectionType: SectionType,
  subtitle?: string
): string {
  const base = identity.nomor
    ? `PUTUSAN PP Nomor ${identity.nomor}`
    : `PUTUSAN PP`;

  let anchor = `${base} - ${sectionType}`;
  if (subtitle) {
    anchor += ` - ${subtitle}`;
  }

  return anchor;
}

/**
 * Split large text into smaller overlapping chunks
 */
function splitLargeText(text: string, maxChars: number = 2000, overlap: number = 200): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;

    // If we are not at the end of text, try to break at a safe boundary (newline or space)
    if (end < text.length) {
      // Look back from 'end' to find a suitable break point
      const lookbackLimit = Math.max(start, end - 500); // Don't look back too far
      let breakPoint = -1;

      // Prefer newline
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline > lookbackLimit) {
        breakPoint = lastNewline;
      } else {
        // Fallback to space
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > lookbackLimit) {
          breakPoint = lastSpace;
        }
      }

      if (breakPoint !== -1) {
        end = breakPoint;
      }
    }

    const chunkText = text.substring(start, end).trim();
    if (chunkText.length > 0) {
      chunks.push(chunkText);
    }

    // If we reached the end, stop
    if (end >= text.length) break;

    // Determine next start position
    // If we found a clean break (space/newline), we want overlap relative to that
    // But typically simply: start = end - overlap
    // Ensure we always advance at least 1 char to avoid infinite loop
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

/**
 * Build chunks from sections
 */
function buildChunks(
  sections: PutusanSection[],
  identity: PutusanIdentity
): PutusanChunk[] {
  const chunks: PutusanChunk[] = [];
  let orderIndex = 0;

  // Helper to add chunks with splitting
  const addSplitChunks = (
    baseAnchor: string,
    chunkType: ChunkType,
    chunkRole: ChunkRole,
    title: string,
    text: string,
    parentId?: string
  ) => {
    const parts = splitLargeText(text);

    parts.forEach((partText, idx) => {
      let partTitle = title;
      let partAnchor = baseAnchor;

      if (parts.length > 1) {
        partTitle = `${title} (Part ${idx + 1}/${parts.length})`;
        partAnchor = `${baseAnchor} - Part ${idx + 1}`;
      }

      chunks.push({
        anchorCitation: partAnchor,
        chunkType,
        role: chunkRole,
        title: partTitle,
        text: partText,
        orderIndex: orderIndex++,
        parentId: parentId,
        legalRefs: extractLegalRefs(partText),
        tokenEstimate: estimateTokens(partText),
      });
    });

    // Return the anchor of the first part to serve as parentId for children
    return parts.length > 0
      ? (parts.length > 1 ? `${baseAnchor} - Part 1` : baseAnchor)
      : baseAnchor;
  };

  for (const section of sections) {
    const role = determineRole(section.type);

    // Check for subsections in POSISI_PEMOHON or POSISI_TERBANDING
    if (section.type === 'POSISI_PEMOHON' || section.type === 'POSISI_TERBANDING') {
      const subsections = parseSubsections(section.text);

      if (subsections.length > 0) {
        // 1. Parent/Intro text
        const parentText = section.text.substring(0, subsections[0].startOffset).trim() || section.title;
        const parentAnchor = generateAnchorCitation(identity, section.type);

        const effectiveParentId = addSplitChunks(
          parentAnchor,
          'SECTION',
          role,
          section.title,
          parentText
        );

        // 2. Subsection chunks
        for (const sub of subsections) {
          const subAnchor = generateAnchorCitation(identity, section.type, `${sub.numeral}. ${sub.title}`);
          addSplitChunks(
            subAnchor,
            'SUBSECTION',
            role,
            `${sub.numeral}. ${sub.title}`,
            sub.text,
            effectiveParentId
          );
        }
        continue;
      }
    }

    // Default handling for simple sections
    const anchor = generateAnchorCitation(identity, section.type);
    const type: ChunkType = section.type === 'AMAR' ? 'AMAR' : 'SECTION';

    addSplitChunks(
      anchor,
      type,
      role,
      section.title,
      section.text
    );
  }

  return chunks;
}

// ============== TABLE EXTRACTION ==============

/**
 * Extract tables from putusan text
 * Tables in PDF are typically formatted with consistent patterns:
 * - Column headers like "NO", "URAIAN", "Pemohon Banding", "Terbanding", etc.
 * - Rows with numbers, descriptions, and currency values
 */
function extractTables(text: string): PutusanTable[] {
  const tables: PutusanTable[] = [];

  // Pattern for detecting table-like structures
  // Look for lines with tab-separated or multi-space-separated values
  // especially with "Menurut" or column headers

  const tablePatterns = [
    // Pattern 1: "Menurut" style headers (common in tax calculation tables)
    /(?:dengan\s+perhitungan\s+sebagai\s+berikut|sebagai\s+berikut)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:Menimbang|bahwa\s+berdasarkan|Demikian\s+diputus)|$)/gi,

    // Pattern 2: Numbered table rows with currency values
    /(?:^|\n)((?:\d+\s+[A-Za-z].*(?:\d{1,3}(?:\.\d{3})*(?:\,\d+)?)\s*\n?)+)/gm,
  ];

  // Look for "perhitungan sebagai berikut" which often precedes tables
  const tableMarkers = text.matchAll(/(?:dengan\s+)?perhitungan\s+(?:pajak\s+)?(?:sebagai\s+)?berikut\s*:?\s*\n/gi);

  for (const marker of tableMarkers) {
    const startPos = marker.index! + marker[0].length;

    // Find the end of the table (next paragraph or section marker)
    const remainingText = text.slice(startPos);
    const endMatch = remainingText.match(/\n\s*(?:Menimbang|bahwa\s+berdasarkan|Demikian|Memperhatikan|\n\n)/i);
    const endPos = endMatch ? startPos + endMatch.index! : startPos + Math.min(remainingText.length, 3000);

    const tableText = text.slice(startPos, endPos).trim();

    if (tableText.length > 50) {
      const parsed = parseTableText(tableText);
      if (parsed && parsed.rows.length > 0) {
        tables.push({
          ...parsed,
          startOffset: startPos,
          endOffset: endPos,
        });
      }
    }
  }

  return tables;
}

/**
 * Parse raw table text into structured table format
 */
function parseTableText(tableText: string): { title: string | null; headers: string[]; rows: PutusanTableRow[] } | null {
  const lines = tableText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 2) return null;

  // Try to detect headers
  // Common headers: NO, URAIAN, Pemohon Banding, Terbanding, Pembahasan Akhir
  let headerLineIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Look for header patterns
    if (/\bNO\b.*\bURAIAN\b/i.test(line) ||
      /\bPemohon\s*Banding\b/i.test(line) ||
      /\bTerbanding\b/i.test(line) ||
      /\bMenurut\b/i.test(line)) {
      headerLineIndex = i;
      // Split by multiple spaces or tabs
      headers = line.split(/\s{2,}|\t/).map(h => h.trim()).filter(h => h.length > 0);
      break;
    }
  }

  if (headerLineIndex === -1) {
    // Default headers for tax calculation tables
    headers = ['NO', 'URAIAN', 'Pemohon Banding (Rp)', 'Terbanding (Rp)', 'Disetujui (Rp)'];
  }

  // Parse data rows
  const rows: PutusanTableRow[] = [];
  const startLine = headerLineIndex >= 0 ? headerLineIndex + 1 : 0;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty or separator lines
    if (line.length < 3 || /^[-=_]+$/.test(line)) continue;

    // Try to parse as a data row
    // Pattern: number followed by description and currency values
    const numberMatch = line.match(/^(\d+(?:\.\d+)?)\s+/);

    if (numberMatch) {
      const cells = line.split(/\s{2,}|\t/).map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 2) {
        rows.push({ cells });
      }
    } else {
      // Could be a continuation or sub-row
      const cells = line.split(/\s{2,}|\t/).map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length >= 2 && cells.some(c => /[\d\.,]+/.test(c))) {
        rows.push({ cells: ['', ...cells] }); // Prepend empty for sub-rows
      }
    }
  }

  if (rows.length === 0) return null;

  return {
    title: null,
    headers,
    rows,
  };
}

// ============== MAIN PARSER ==============

/**
 * Parse a putusan document into structured sections and chunks
 */
export function parsePutusan(rawText: string): PutusanParseResult {
  // 1. Clean text
  const cleanedText = cleanPutusanText(rawText);

  // 2. Extract identity (nomor, tahun)
  const identity = extractPutusanIdentity(cleanedText);

  // 3. Find section boundaries
  const boundaries = findSectionBoundaries(cleanedText);

  // 4. Segment into sections
  const sections = segmentIntoSections(cleanedText, boundaries);

  // 5. Build chunks from sections
  const chunks = buildChunks(sections, identity);

  // 6. Extract evidence items from all sections
  const evidenceItems: EvidenceItem[] = [];
  for (const section of sections) {
    const items = parseEvidenceItems(section.text, section.startOffset);
    evidenceItems.push(...items);
  }

  // 7. Link evidence to chunks that mention them
  for (const evidence of evidenceItems) {
    for (const chunk of chunks) {
      if (chunk.text.includes(`Bukti ${evidence.code}`) || chunk.text.includes(`P-${evidence.code.replace('P-', '')}`)) {
        evidence.mentionedInChunkIds.push(chunk.anchorCitation);
      }
    }
  }

  // 8. Extract tables from text
  const tables = extractTables(cleanedText);

  return {
    identity,
    sections,
    chunks,
    evidenceItems,
    tables,
  };
}

/**
 * Convert PutusanChunk to database-compatible format
 */
export function putusanChunkToDbFormat(chunk: PutusanChunk): {
  anchorCitation: string;
  pasal: string | null;
  ayat: string | null;
  huruf: string | null;
  chunkType: ChunkType;
  role: ChunkRole;
  title: string | null;
  parentChunkId: string | null;
  legalRefs: object | null;
  orderIndex: number;
  text: string;
  tokenEstimate: number;
} {
  return {
    anchorCitation: chunk.anchorCitation,
    pasal: null,
    ayat: null,
    huruf: null,
    chunkType: chunk.chunkType,
    role: chunk.role,
    title: chunk.title,
    parentChunkId: chunk.parentId || null,
    legalRefs: chunk.legalRefs && chunk.legalRefs.length > 0 ? { refs: chunk.legalRefs } : null,
    orderIndex: chunk.orderIndex,
    text: chunk.text,
    tokenEstimate: chunk.tokenEstimate,
  };
}
