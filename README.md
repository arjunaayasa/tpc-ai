# TPC AI - Tax Assistant

<p align="center">
  <img src="public/logotpc.jpg" alt="TPC AI Logo" width="120" height="120" style="border-radius: 50%;">
</p>

<p align="center">
  <strong>Asisten Pajak Cerdas Berbasis AI</strong><br>
  RAG-powered chatbot untuk menjawab pertanyaan perpajakan Indonesia dengan sitasi pasal yang akurat
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-18-blue" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/pgvector-0.8-green" alt="pgvector">
  <img src="https://img.shields.io/badge/Ollama-LLM-orange" alt="Ollama">
</p>

---

## Tentang TPC AI

**TPC AI** adalah asisten perpajakan berbasis kecerdasan buatan yang dirancang khusus untuk menjawab pertanyaan seputar regulasi pajak Indonesia. Menggunakan teknologi **RAG (Retrieval-Augmented Generation)**, TPC AI dapat:

- Menjawab pertanyaan perpajakan dengan **akurat dan kontekstual**
- Memberikan **sitasi pasal** dari dokumen regulasi resmi
- Menampilkan **proses berpikir (Thinking Mode)** untuk transparansi
- Menyediakan interface chat **seperti ChatGPT** yang familiar

## Fitur Utama

### Chat Interface
- **Streaming Response** - Jawaban ditampilkan secara real-time
- **Thinking Mode** - Tampilkan proses analisis AI (collapsible)
- **Multi-conversation** - Kelola banyak percakapan dengan history
- **Suggestion Chips** - Quick prompts untuk pertanyaan umum
- **Dark Mode UI** - Tampilan modern seperti ChatGPT

### Document Management
- **Upload Dokumen** - Drag-and-drop PDF, HTML, TXT
- **Ekstraksi Metadata Otomatis** - Deteksi jenis regulasi, nomor, tahun
- **Chunking per Pasal/Ayat** - Pemecahan dokumen untuk pencarian akurat
- **Vector Embeddings** - Embedding otomatis dengan Ollama/TEI
- **Review Workflow** - Draft, approve, atau re-run extraction

### RAG System
- **Semantic Search** - Pencarian berbasis makna dengan pgvector
- **Citation System** - Referensi pasal yang dapat diklik
- **Context-Aware** - Jawaban berdasarkan dokumen yang relevan
- **Opinion Support** - AI dapat memberikan analisis profesional jika diminta

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| **Backend** | Next.js API Routes, Server-Sent Events (SSE) |
| **Database** | PostgreSQL 18 + Prisma ORM + **pgvector** |
| **Vector Store** | pgvector (768 dimensions) |
| **Embeddings** | Ollama (nomic-embed-text) / TEI |
| **LLM** | Ollama (qwen2.5:7b-instruct) |
| **Queue** | Redis + BullMQ |
| **Storage** | Local filesystem (`/uploads`) |

---

## Quick Start

### Prerequisites

| Software | Version | Required |
|----------|---------|----------|
| Node.js | 18+ | Yes |
| PostgreSQL | 15+ | Yes |
| Redis | 7+ | For worker |

### 1. Clone & Install

```bash
git clone <repository-url>
cd metadata-gen
npm install
```

### 2. Setup Environment

```bash
# Copy template
cp env.example .env

# Edit .env with your database credentials
```

**`.env` file:**
```env
# PostgreSQL connection
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/taxkb?schema=public"

# Redis connection (untuk worker)
REDIS_URL="redis://localhost:6379"

# Upload directory
UPLOAD_DIR="./uploads"

# ============== RAG Configuration ==============

# Embedding Provider: 'tei' atau 'ollama'
EMBEDDING_PROVIDER="ollama"

# TEI (Text Embeddings Inference) settings
# EMBEDDING_BASE_URL="http://localhost:8080"
# EMBEDDING_MODEL="BAAI/bge-base-en-v1.5"

# Ollama Embeddings settings
EMBEDDING_BASE_URL="http://localhost:11434"
EMBEDDING_MODEL="nomic-embed-text"
EMBEDDING_DIM="1024"

# Ollama LLM for RAG
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="qwen2.5:7b-instruct"
```

### 3. Setup Database

#### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL + Redis
docker compose up -d

# Run migrations
npx prisma migrate dev --name init
```

#### Option B: Local Installation

<details>
<summary><strong>macOS</strong></summary>

```bash
# Install dengan Homebrew
brew install postgresql@15 redis

# Start services
brew services start postgresql@15
brew services start redis

# Create database
createdb taxkb

# Run migrations
npx prisma migrate dev --name init
```
</details>

<details>
<summary><strong>Windows</strong></summary>

1. **PostgreSQL**: Download dari https://www.postgresql.org/download/windows/
2. **Redis**: Download dari https://github.com/tporadowski/redis/releases

```powershell
# Create database (dengan psql atau pgAdmin)
psql -U postgres -c "CREATE DATABASE taxkb;"

# Run migrations
npx prisma migrate dev --name init
```
</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
# Install
sudo apt update
sudo apt install postgresql redis-server

# Start services
sudo systemctl start postgresql redis

# Create database
sudo -u postgres createdb taxkb

# Run migrations
npx prisma migrate dev --name init
```
</details>

### 4. Run Application

```bash
# Terminal 1: Start Next.js dev server
npm run dev

# Terminal 2: Start background worker (optional, needs Redis)
npm run worker
```

🎉 **Open http://localhost:3000**

---

## 🤖 RAG Setup (Retrieval-Augmented Generation)

Untuk menggunakan fitur tanya-jawab dengan sitasi pasal, Anda perlu menjalankan:

### 1. Install pgvector Extension

pgvector diperlukan untuk vector similarity search. Pastikan PostgreSQL Anda mendukung pgvector:

```bash
# Jika menggunakan Docker, pgvector sudah terinstall
# Jika install manual di Ubuntu/Debian:
sudo apt install postgresql-15-pgvector

# Run migration untuk enable extension
npx prisma migrate deploy
```

### 2. Setup Embedding Provider

#### Option A: Ollama Embeddings (Recommended - Easy Setup)

```bash
# Install Ollama (https://ollama.ai)
# Windows: Download installer dari ollama.ai
# macOS: brew install ollama
# Linux: curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama
ollama serve

# Pull embedding model (768 dimensions, fast)
ollama pull nomic-embed-text

# Atau model lain:
# ollama pull mxbai-embed-large  # 1024 dimensions
# ollama pull all-minilm         # 384 dimensions, very fast
```

#### Option B: TEI (Text Embeddings Inference - Production)

```bash
# Run TEI dengan Docker
docker run -d --gpus all -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id BAAI/bge-base-en-v1.5

# Update .env
EMBEDDING_PROVIDER="tei"
EMBEDDING_BASE_URL="http://localhost:8080"
```

### 3. Setup LLM untuk Generation

```bash
# Pull model LLM (dengan Ollama)
ollama pull qwen2.5:7b-instruct

# Atau model lain yang recommended:
# ollama pull llama3.1:8b-instruct
# ollama pull mistral:7b-instruct
```

### 4. Generate Embeddings

Embeddings akan otomatis di-generate saat dokumen di-process oleh worker. Untuk dokumen yang sudah ada:

```bash
# Re-run extraction untuk generate embeddings
# Buka /documents/{id} dan click "Re-extract"
```

### 5. Test RAG Endpoint

```bash
# Check health
curl http://localhost:3000/api/rag/ask

# Ask a question
curl -X POST http://localhost:3000/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Apa syarat untuk menjadi Pengusaha Kena Pajak?",
    "topK": 10,
    "mode": "strict"
  }'
```

### 6. Gunakan UI

Buka **http://localhost:3000/rag** untuk antarmuka tanya-jawab.

---

## 📁 Project Structure

```
metadata-gen/
├── prisma/
│   └── schema.prisma        # Database models
├── src/
│   ├── app/
│   │   ├── page.tsx         # Redirect to /documents
│   │   ├── upload/          # Upload page
│   │   ├── documents/       # List & detail pages
│   │   └── api/             # API routes
│   ├── lib/
│   │   ├── prisma.ts        # DB client
│   │   ├── queue.ts         # BullMQ config
│   │   ├── upload.ts        # File handling
│   │   ├── extraction.ts    # Text extraction
│   │   ├── heuristics.ts    # Metadata extraction
│   │   └── validation.ts    # Zod schemas
│   └── worker/
│       └── worker.ts        # Background processor
├── uploads/                 # File storage (gitignored)
├── docker-compose.yml
├── env.example
└── package.json
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload document (multipart/form-data) |
| `GET` | `/api/documents/[id]` | Get document with metadata |
| `PATCH` | `/api/documents/[id]/metadata` | Update metadata |
| `POST` | `/api/documents/[id]/rerun` | Re-run extraction |
| `GET` | `/api/documents/[id]/chunks` | Get document chunks |
| `GET` | `/api/rag/ask` | Check RAG service health |
| `POST` | `/api/rag/ask` | Ask question with RAG |

### RAG Ask Example

```bash
curl -X POST http://localhost:3000/api/rag/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Bagaimana cara pendaftaran NPWP?",
    "topK": 12,
    "filters": {
      "jenis": "UU",
      "tahun": 2007
    },
    "mode": "strict"
  }'
```

**Response:**
```json
{
  "answer": "**Kesimpulan**: Setiap Wajib Pajak yang telah memenuhi...",
  "citations": [
    {
      "label": "C1",
      "chunkId": "uuid",
      "anchorCitation": "UU 28 Pasal 2 ayat (1)",
      "documentId": "uuid",
      "jenis": "UU",
      "nomor": "28",
      "tahun": 2007
    }
  ],
  "chunksUsed": [...],
  "metadata": {
    "question": "...",
    "topK": 12,
    "mode": "strict",
    "chunksRetrieved": 12,
    "processingTimeMs": 3500
  }
}
```

### Upload Example

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@/path/to/document.pdf"
```

### Update Metadata Example

```bash
curl -X PATCH http://localhost:3000/api/documents/{id}/metadata \
  -H "Content-Type: application/json" \
  -d '{
    "jenis": "PMK",
    "nomor": "123/PMK.03/2024",
    "tahun": 2024,
    "approve": true
  }'
```

---

## 🔧 Metadata Extraction

Sistem mendeteksi metadata dari text dokumen menggunakan regex patterns:

| Field | Pattern Examples |
|-------|-----------------|
| **Jenis** | UU, PP, PMK, PER, SE, KEP |
| **Nomor** | `NOMOR 123`, `NO. 45/PMK.03/2024` |
| **Tahun** | 4-digit tahun (1990-2030) |
| **Judul** | Text setelah "TENTANG" |
| **Tanggal** | Format Indonesia: `1 Januari 2024`, `01/01/2024` |

### Confidence Score

Score dihitung berdasarkan kelengkapan:
- Jenis ditemukan: +25%
- Nomor ditemukan: +25%
- Tahun ditemukan: +20%
- Judul ditemukan: +15%
- Tanggal Terbit: +10%
- Tanggal Berlaku: +5%

---

## 🔄 Worker Process

Background worker memproses queue `extract_metadata`:

1. Set status → `processing`
2. Baca file dari filesystem
3. Extract text (PDF/HTML/TXT)
4. Jalankan regex heuristics
5. Hitung confidence score
6. Simpan metadata ke database
7. Set status → `needs_review` atau `failed`

### File Type Support

| Type | Library | Limit |
|------|---------|-------|
| PDF | `pdf-parse` | 2 halaman pertama |
| HTML | `cheerio` | 10,000 karakter |
| TXT | Native fs | 10,000 karakter |

---

## 🐳 Docker Compose

Full stack dengan Docker:

```bash
# Start all services
docker compose up -d

# Check logs
docker compose logs -f

# Stop
docker compose down
```

**Services:**
- `postgres` - PostgreSQL 15 on port 5432
- `redis` - Redis 7 on port 6379

---

## 📝 Database Schema

```prisma
enum DocumentStatus {
  uploaded
  processing
  needs_review
  approved
  failed
}

enum RegulationType {
  UU      // Undang-Undang
  PP      // Peraturan Pemerintah
  PMK     // Peraturan Menteri Keuangan
  PER     // Peraturan Dirjen
  SE      // Surat Edaran
  KEP     // Keputusan
  UNKNOWN
}

model Document {
  id           String         @id @default(uuid())
  fileName     String
  originalName String
  mimeType     String
  filePath     String
  sha256       String         @unique
  status       DocumentStatus @default(uploaded)
  lastError    String?
  metadata     DocumentMetadata?
}

model DocumentMetadata {
  id              String           @id @default(uuid())
  documentId      String           @unique
  jenis           RegulationType   @default(UNKNOWN)
  nomor           String?
  tahun           Int?
  judul           String?
  tanggalTerbit   DateTime?
  tanggalBerlaku  DateTime?
  statusAturan    RegulationStatus @default(unknown)
  confidence      Float            @default(0)
  updatedByUser   Boolean          @default(false)
}
```

---

## 🧪 Development

### Scripts

```bash
npm run dev      # Start Next.js dev server
npm run worker   # Start background worker
npm run build    # Build for production
npm run lint     # Run ESLint
```

### Prisma Commands

```bash
npx prisma migrate dev    # Create & apply migration
npx prisma studio         # Open database GUI
npx prisma generate       # Regenerate client
```

---

## ⚠️ Troubleshooting

### "Redis connection refused"
Worker membutuhkan Redis. Pastikan Redis berjalan:
```bash
# macOS
brew services start redis

# Windows (jalankan redis-server.exe)
# Linux
sudo systemctl start redis
```

### "Database connection failed"
Periksa `DATABASE_URL` di `.env` dan pastikan PostgreSQL berjalan.

### "Upload failed - file too large"
Maksimum file size adalah 50MB.

---

## 📄 License

MIT

---

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request
