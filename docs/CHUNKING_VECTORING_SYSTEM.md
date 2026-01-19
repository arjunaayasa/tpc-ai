# Sistem Chunking & Vectoring AI TPC

Dokumentasi teknis sistem chunking dan vectoring untuk RAG AI TPC (Owlie).

---

## 1. Document Types & Extractors

| Jenis Dokumen | Extractor | Chunking Strategy |
|---------------|-----------|-------------------|
| **PUTUSAN** | `putusanExtractor.ts` | Section-based (HEADER, DUDUK_PERKARA, POSISI_PEMOHON, POSISI_TERBANDING, AMAR) |
| **PMK** | `pmkExtractor.ts` | Pasal + Ayat + Huruf hierarchy |
| **PP/PERPU** | `perpuExtractor.ts` | Pasal-based |
| **UU** | `uuExtractor.ts` | Pasal + Penjelasan linking |
| **BUKU** | `bukuExtractor.ts` | Chapter/section-based |

---

## 2. Chunking Pipeline - PUTUSAN

```
┌────────────────────────────────────────────────────┐
│                  RAW PDF TEXT                       │
│         (extracted via pdf-parse)                   │
└────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────┐
│           TEXT CLEANING (cleanPutusanText)          │
│  • Remove page numbers                              │
│  • Remove headers/footers                           │
│  • Normalize whitespace                             │
└────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────┐
│       SECTION DETECTION (findSectionBoundaries)    │
│  Regex patterns untuk detect:                       │
│  • "DUDUK PERKARA"                                  │
│  • "Menimbang, bahwa Pemohon Banding..."            │
│  • "Menimbang, bahwa Terbanding..."                 │
│  • "M E N G A D I L I" (AMAR)                       │
└────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────┐
│         SUBSECTION PARSING (Roman Numerals)         │
│  Untuk POSISI_PEMOHON / POSISI_TERBANDING:          │
│  • "I. Pokok Sengketa"                              │
│  • "II. Dasar Koreksi"                              │
│  • "III. Argumentasi"                               │
└────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────┐
│            CHUNK SPLITTING (splitLargeText)         │
│  • Max chunk size: 2000 chars                       │
│  • Overlap: 200 chars                               │
│  • Break at newline/space boundaries                │
│  • Token estimate: ~4 chars/token                   │
└────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────┐
│                   OUTPUT CHUNK                      │
│  {                                                  │
│    anchorCitation: "PUTUSAN PP No XXX - POSISI..", │
│    chunkType: "SECTION" | "SUBSECTION" | "AMAR",   │
│    role: "PEMOHON" | "TERBANDING" | "MAJELIS",     │
│    title: "I. Pokok Sengketa",                     │
│    text: "...",                                     │
│    legalRefs: ["Pasal 6", "Pasal 18 ayat (3)"],   │
│    tokenEstimate: 500,                             │
│    orderIndex: 3,                                  │
│    parentId: "parent-chunk-anchor"                 │
│  }                                                  │
└────────────────────────────────────────────────────┘
```

---

## 3. Vectoring / Embedding

```
┌────────────────────────────────────────────────────┐
│              EMBEDDING GENERATION                   │
│  File: src/lib/embeddings.ts                        │
│                                                     │
│  • Model: text-embedding-3-small (OpenAI)          │
│    atau Ollama embedding model                      │
│  • Dimension: 1536 (OpenAI) / varies               │
│  • Batch processing untuk multiple chunks           │
└────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────┐
│              DATABASE STORAGE                       │
│  PostgreSQL + pgvector extension                    │
│                                                     │
│  Tables:                                            │
│  ├── Document (metadata, isActiveForRAG)           │
│  ├── DocumentMetadata (jenis, nomor, tahun, judul) │
│  ├── RegulationChunk (text, anchorCitation, role)  │
│  └── ChunkEmbedding (vector[1536])                 │
│                                                     │
│  Index: HNSW atau IVFFlat untuk fast similarity    │
└────────────────────────────────────────────────────┘
```

---

## 4. Database Schema

```sql
-- Document
Document {
  id            UUID
  originalName  String
  isActiveForRAG Boolean   -- Toggle untuk include/exclude di retrieval
}

-- Metadata  
DocumentMetadata {
  documentId    UUID FK
  jenis         RegulationType   -- PUTUSAN, PMK, PP, UU, BUKU, etc.
  nomor         String?
  tahun         Int?
  judul         String?
  statusAturan  RegulationStatus -- BERLAKU, DICABUT, etc.
}

-- Chunks
RegulationChunk {
  id             UUID
  documentId     UUID FK
  anchorCitation String   -- "PUTUSAN PP No XXX - POSISI_PEMOHON - I. Pokok Sengketa"
  pasal          String?
  ayat           String?
  huruf          String?
  chunkType      String   -- SECTION, SUBSECTION, AMAR, EVIDENCE
  role           String   -- PEMOHON, TERBANDING, MAJELIS, UNKNOWN
  title          String?
  text           String   -- Actual chunk content
  tokenEstimate  Int?
  orderIndex     Int      -- For ordering chunks in document
  legalRefs      JSON?    -- {"refs": ["Pasal 6", "Pasal 18"]}
}

-- Embeddings
ChunkEmbedding {
  chunkId   UUID FK
  embedding vector(1536)  -- pgvector type
}
```

---

## 5. Retrieval Query

```sql
-- Similarity search dengan pgvector
SELECT 
    rc.*,
    1 - (ce.embedding <=> $query_vector::vector) as similarity
FROM "ChunkEmbedding" ce
JOIN "RegulationChunk" rc ON rc.id = ce."chunkId"
JOIN "Document" d ON d.id = rc."documentId"
WHERE d."isActiveForRAG" = true
  AND ce.embedding IS NOT NULL
ORDER BY ce.embedding <=> $query_vector::vector
LIMIT 12;  -- topK
```

---

## 6. Key Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Max chunk size | 2000 chars | Maximum characters per chunk |
| Chunk overlap | 200 chars | Overlap between consecutive chunks |
| Token estimate ratio | ~4 chars/token | Rough estimation for Indonesian text |
| Embedding dimension | 1536 | OpenAI text-embedding-3-small |
| Default topK retrieval | 12 chunks | Initial retrieval count |
| Max final chunks | 25 chunks | After context expansion |
| Context truncation | 4000 chars | Per chunk limit in prompt |

---

## 7. Section Types (Putusan)

| Section Type | Description | Role |
|--------------|-------------|------|
| `HEADER` | Identitas putusan | UNKNOWN |
| `RIWAYAT_PROSES` | Riwayat proses banding | UNKNOWN |
| `DUDUK_PERKARA` | Duduk perkara | UNKNOWN |
| `POSISI_PEMOHON` | Argumen Pemohon Banding/Penggugat | PEMOHON |
| `POSISI_TERBANDING` | Argumen Terbanding/Tergugat (DJP) | TERBANDING |
| `SURAT_BANTAHAN` | Surat Bantahan Pemohon | PEMOHON |
| `PEMBUKTIAN` | Bukti-bukti | UNKNOWN |
| `PERTIMBANGAN_MAJELIS` | Pertimbangan hukum Majelis | MAJELIS |
| `AMAR` | Amar putusan (keputusan akhir) | MAJELIS |

---

## 8. Chunk Types

| Chunk Type | Description |
|------------|-------------|
| `SECTION` | Main section chunk |
| `SUBSECTION` | Sub-section (Roman numeral, e.g., "I. Pokok Sengketa") |
| `EVIDENCE` | Evidence/Bukti items |
| `AMAR` | Final verdict chunk |

---

## 9. File Locations

```
src/lib/
├── embeddings.ts           # Embedding generation (OpenAI/Ollama)
├── retrieval.ts            # Basic pgvector retrieval
├── extractors/
│   ├── putusanExtractor.ts # Putusan chunking logic
│   ├── pmkExtractor.ts     # PMK chunking
│   ├── perpuExtractor.ts   # Perpu chunking
│   ├── uuExtractor.ts      # UU chunking
│   └── bukuExtractor.ts    # Buku chunking
└── rag/
    ├── retriever.ts        # Hybrid retrieval (vector + keyword)
    ├── reranker.ts         # Score-based reranking
    ├── contextExpansion.ts # Parent/sibling expansion
    └── planner.ts          # Query planning
```

---

*Last updated: January 2026*
