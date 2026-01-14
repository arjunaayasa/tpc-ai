/**
 * PMK Regex Patterns - Regular expressions for PMK document parsing
 */

// ============== IDENTITY PATTERNS ==============

/** PMK header pattern */
export const PMK_HEADER_REGEX = /PERATURAN\s+MENTERI\s+KEUANGAN/i;

/** SALINAN header (often appears before PMK number) */
export const SALINAN_REGEX = /^SALINAN\s*$/im;

/** PMK number pattern - e.g., "NOMOR 168/PMK.010/2023" or "NOMOR 168 TAHUN 2023" */
export const PMK_NOMOR_REGEX = /NOMOR\s+(\d+(?:\/PMK\.[\d]+\/\d{4})?|\d+(?:\s+TAHUN\s+\d{4})?)/i;

/** Subject pattern - \"TENTANG ...\" - uses [\\s\\S] for dotAll behavior */
export const TENTANG_REGEX = /TENTANG\\s+([\\s\\S]+?)(?=\\s*(?:$|Menimbang|DENGAN|Bahwa))/i;

/** Date patterns */
export const TANGGAL_TERBIT_REGEX = /Ditetapkan\s+di\s+.+\s+pada\s+tanggal\s+(\d+\s+\w+\s+\d{4})/i;
export const TANGGAL_BERLAKU_REGEX = /mulai\s+berlaku\s+(?:pada\s+)?(?:tanggal\s+)?(\d+\s+\w+\s+\d{4}|tanggal\s+diundangkan)/i;

// ============== STRUCTURE PATTERNS ==============

/** Menimbang block start - allow leading whitespace for pdfplumber */
export const MENIMBANG_REGEX = /^\s*Menimbang\s*:/im;

/** Mengingat block start - allow leading whitespace */
export const MENGINGAT_REGEX = /^\s*Mengingat\s*:/im;

/** MEMUTUSKAN or Menetapkan - allow leading whitespace */
export const MEMUTUSKAN_REGEX = /^\s*MEMUTUSKAN\s*:/im;
export const MENETAPKAN_REGEX = /^\s*Menetapkan\s*:/im;

/** BAB pattern - e.g., "BAB I" or "BAB XIV" - allow leading whitespace */
export const BAB_REGEX = /^\s*BAB\s+([IVXLC]+)\b\s*\n?([^\n]*)?/im;
export const BAB_GLOBAL_REGEX = /^\s*BAB\s+([IVXLC]+)\b\s*\n?([^\n]*)?/gim;

/** Bagian pattern - e.g., "Bagian Kesatu" - allow leading whitespace */
export const BAGIAN_REGEX = /^\s*Bagian\s+(Kesatu|Kedua|Ketiga|Keempat|Kelima|Keenam|Ketujuh|Kedelapan|Kesembilan|Kesepuluh|Kesebelas|Keduabelas)\b\s*\n?([^\n]*)?/im;
export const BAGIAN_GLOBAL_REGEX = /^\s*Bagian\s+(Kesatu|Kedua|Ketiga|Keempat|Kelima|Keenam|Ketujuh|Kedelapan|Kesembilan|Kesepuluh|Kesebelas|Keduabelas)\b\s*\n?([^\n]*)?/gim;

/** Pasal pattern - must be at start of line, not a reference like "dalam Pasal 21" */
export const PASAL_REGEX = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/im;
export const PASAL_GLOBAL_REGEX = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/gim;

/** Ayat pattern - e.g., "(1)" at start of line within pasal - allow leading whitespace */
export const AYAT_REGEX = /^\s*\((\d+)\)\s+/m;
export const AYAT_GLOBAL_REGEX = /^\s*\((\d+)\)\s+/gm;

/** Penutup patterns - allow leading whitespace */
export const DIUNDANGKAN_REGEX = /^\s*Diundangkan\s+di/im;
export const DITETAPKAN_REGEX = /^\s*Ditetapkan\s+di/im;
export const BERITA_NEGARA_REGEX = /BERITA\s+NEGARA\s+REPUBLIK\s+INDONESIA/i;

// ============== CLASSIFICATION PATTERNS ==============

/** Publication heading patterns - allow leading whitespace for pdfplumber */
export const HEADING_PATTERNS = [
    /^\s*LATAR\s+BELAKANG\b/im,
    /^\s*TUJUAN\b/im,
    /^\s*SASARAN\b/im,
    /^\s*SUBSTANSI\b/im,
    /^\s*STRUKTUR\b/im,
    /^\s*KETENTUAN\s+UMUM\b/im,
    /^\s*KETENTUAN\s+POKOK\b/im,
    /^\s*RINGKASAN\b/im,
    /^\s*PENUTUP\b/im,
    /^\s*POIN(?:-|\s)POIN\s+PENTING\b/im,
];

export const HEADING_GLOBAL_REGEX = /^\s*(LATAR\s+BELAKANG|TUJUAN|SASARAN|SUBSTANSI|STRUKTUR|KETENTUAN\s+UMUM|KETENTUAN\s+POKOK|RINGKASAN|PENUTUP|POIN(?:-|\s)POIN\s+PENTING)\b/gim;

/** All-caps heading detection (3-80 chars) - allow leading whitespace */
export const ALLCAPS_HEADING_REGEX = /^\s*[A-Z][A-Z\s\-]{2,78}$/gm;

// ============== LEGAL REFERENCE PATTERNS ==============

/** Legal reference patterns */
export const PASAL_REF_REGEX = /Pasal\s+\d+(?:\s+ayat\s*\(\d+\))?/gi;
export const UU_REF_REGEX = /Undang-Undang\s+(?:Nomor\s+)?\d+\s+Tahun\s+\d{4}/gi;
export const PP_REF_REGEX = /Peraturan\s+Pemerintah\s+(?:Nomor\s+)?\d+\s+Tahun\s+\d{4}/gi;
export const PMK_REF_REGEX = /Peraturan\s+Menteri\s+Keuangan\s+(?:Nomor\s+)?[\d\/PMK\.]+/gi;

// ============== CLEANUP PATTERNS ==============

/** Page number removal */
export const PAGE_NUMBER_REGEX = /^\s*-?\s*\d+\s*-?\s*$/gm;
export const PAGE_HEADER_REGEX = /^(?:Halaman|hal\.?)\s*\d+\s*(?:dari|\/)\s*\d+/gim;

/** Website/footer patterns */
export const WEBSITE_REGEX = /(?:www\.|https?:\/\/)[^\s]+/gi;
export const PAJAK_GO_ID_REGEX = /pajak\.go\.id/gi;
