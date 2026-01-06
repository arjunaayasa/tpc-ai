# Tax KB Ingestion MVP

Sistem ingestion dokumen regulasi pajak Indonesia dengan ekstraksi metadata otomatis.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue)
![Redis](https://img.shields.io/badge/Redis-7-red)

## ✨ Fitur

- **Upload Dokumen** - Drag-and-drop PDF, HTML, TXT dengan validasi
- **Ekstraksi Metadata Otomatis** - Regex heuristics untuk regulasi pajak Indonesia
- **Review Workflow** - Save draft, approve, atau re-run extraction
- **Status Tracking** - uploaded → processing → needs_review → approved/failed

## 🏗️ Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Node runtime)
- **Database**: PostgreSQL + Prisma ORM
- **Queue**: Redis + BullMQ
- **File Storage**: Local filesystem (`/uploads`)

---

## 🚀 Quick Start

### Prerequisites

| Software | Version | Required |
|----------|---------|----------|
| Node.js | 18+ | ✅ Yes |
| PostgreSQL | 15+ | ✅ Yes |
| Redis | 7+ | ⚠️ For worker |

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
