/**
 * PER Regex Patterns - Regular expressions for PER document parsing
 */

// ============== HEADER & IDENTITY ==============

/** PER Header pattern */
export const PER_HEADER_REGEX = /PERATURAN\s+DIREKTUR\s+JENDERAL\s+PAJAK\b/i;

/** PER Nomor pattern - e.g., "NOMOR PER-11/PJ/2015" or "PER-11/PJ/2015" */
export const PER_NOMOR_REGEX = /(?:NOMOR\s+)?PER[\s-]*(\d+)\/PJ\/(\d{4})/i;

/** TENTANG pattern */
export const TENTANG_REGEX = /TENTANG\s+([\s\S]+?)(?=\s*(?:$|Menimbang|DENGAN|Bahwa))/i;

// ============== PEMBUKA / PENETAPAN ==============

/** Menimbang pattern - allow leading whitespace for pdfplumber output */
export const MENIMBANG_REGEX = /^\s*Menimbang\s*:/im;

/** Mengingat pattern - allow leading whitespace */
export const MENGINGAT_REGEX = /^\s*Mengingat\s*:/im;

/** MEMUTUSKAN pattern - allow leading whitespace */
export const MEMUTUSKAN_REGEX = /^\s*MEMUTUSKAN\s*:/im;

/** Menetapkan pattern - allow leading whitespace */
export const MENETAPKAN_REGEX = /^\s*Menetapkan\s*:/im;

// ============== STRUKTUR BATANG TUBUH ==============

/** BAB pattern - e.g., "BAB I", "BAB II" - allow leading whitespace for pdfplumber */
export const BAB_REGEX = /^\s*BAB\s+([IVXLC]+)\b\s*\n?([^\n]*)?/im;
export const BAB_GLOBAL_REGEX = /^\s*BAB\s+([IVXLC]+)\b\s*\n?([^\n]*)?/gim;

/** Bagian pattern - e.g., "Bagian Kesatu" - allow leading whitespace */
export const BAGIAN_REGEX = /^\s*Bagian\s+(Kesatu|Kedua|Ketiga|Keempat|Kelima|Keenam|Ketujuh|Kedelapan|Kesembilan|Kesepuluh|Kesebelas|Keduabelas)\b\s*\n?([^\n]*)?/im;
export const BAGIAN_GLOBAL_REGEX = /^\s*Bagian\s+(Kesatu|Kedua|Ketiga|Keempat|Kelima|Keenam|Ketujuh|Kedelapan|Kesembilan|Kesepuluh|Kesebelas|Keduabelas)\b\s*\n?([^\n]*)?/gim;

/** Paragraf pattern - e.g., "Paragraf 1" - allow leading whitespace */
export const PARAGRAF_REGEX = /^\s*Paragraf\s+(\d+)\b\s*\n?([^\n]*)?/im;
export const PARAGRAF_GLOBAL_REGEX = /^\s*Paragraf\s+(\d+)\b\s*\n?([^\n]*)?/gim;

/** Pasal pattern */
export const PASAL_REGEX = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/im;
export const PASAL_GLOBAL_REGEX = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/gim;

/** Ayat pattern - e.g., "(1)" at start of line - allow leading whitespace */
export const AYAT_REGEX = /^\s*\((\d+)\)\s+/m;
export const AYAT_GLOBAL_REGEX = /^\s*\((\d+)\)\s+/gm;

// ============== LAMPIRAN ==============

/** Lampiran header pattern - allow leading whitespace */
export const LAMPIRAN_REGEX = /^\s*LAMPIRAN\b/im;

/** Lampiran section heading - all caps lines or numbered headings - allow leading whitespace */
export const LAMPIRAN_HEADING_REGEX = /^\s*([A-Z][A-Z\s]{5,80}|[IVXLC]+\.\s+[A-Z]|\d+\.\s+[A-Z]).*$/gm;

// ============== PENUTUP ==============

/** Ditetapkan pattern - allow leading whitespace */
export const DITETAPKAN_REGEX = /^\s*Ditetapkan\s+di\s+/im;

/** Diundangkan pattern - allow leading whitespace */
export const DIUNDANGKAN_REGEX = /^\s*Diundangkan\s+di\s+/im;

// ============== SALINDIA (PRESENTATION) HEADINGS ==============

/** Slide heading patterns */
export const SALINDIA_HEADING_REGEX = /^(Overview|OVERVIEW|Latar\s+Belakang|LATAR\s+BELAKANG|Struktur\s+Pengaturan|STRUKTUR\s+PENGATURAN|Pokok[- ]pokok\s+Perubahan|POKOK[- ]POKOK\s+PERUBAHAN|Ruang\s+Lingkup|RUANG\s+LINGKUP|Tujuan|TUJUAN|Dasar\s+Hukum|DASAR\s+HUKUM|Ketentuan\s+Umum|KETENTUAN\s+UMUM|Kesimpulan|KESIMPULAN|Penutup|PENUTUP)\b/gim;

/** All caps line as heading (3-80 chars) */
export const ALLCAPS_HEADING_REGEX = /^[A-Z][A-Z\s\-\d]{2,79}$/gm;

// ============== LEGAL REFERENCES ==============

/** Legal reference pattern */
export const LEGAL_REF_REGEX = /(?:Pasal\s+\d+[A-Z]?(?:\s+ayat\s*\(\d+\))?|UU\s+(?:Nomor|No\.?)\s*\d+|PP\s+(?:Nomor|No\.?)\s*\d+|PMK\s+(?:Nomor|No\.?)\s*[\d\/]+|PER[\s-]*\d+\/PJ\/\d{4})/gi;

// ============== TANGGAL ==============

/** Tanggal terbit pattern */
export const TANGGAL_TERBIT_REGEX = /Ditetapkan\s+di\s+\w+[\s\S]*?pada\s+tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i;

/** Tanggal berlaku pattern */
export const TANGGAL_BERLAKU_REGEX = /mulai\s+berlaku\s+(?:pada\s+tanggal\s+)?(?:diundangkan|(\d{1,2}\s+\w+\s*\d{4}))/i;

// ============== CLEANUP ==============

/** Page number pattern */
export const PAGE_NUMBER_REGEX = /^\s*-?\s*\d+\s*-?\s*$/gm;

/** Page header/footer pattern */
export const PAGE_HEADER_REGEX = /^.*(?:DIREKTUR\s+JENDERAL|PERATURAN|LAMPIRAN).*\d+\s*$/gim;
