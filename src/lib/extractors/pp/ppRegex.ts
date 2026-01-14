/**
 * PP Regex Patterns - Regular expressions for PP document parsing
 */

// ============== HEADER & IDENTITY ==============

/** PP Header pattern */
export const PP_HEADER_REGEX = /PERATURAN\s+PEMERINTAH\s+(?:REPUBLIK\s+INDONESIA\s+)?/i;

/** PP Nomor pattern - e.g., "NOMOR 23 TAHUN 2018" */
export const PP_NOMOR_REGEX = /NOMOR\s+(\d+)\s+TAHUN\s+(\d{4})/i;

/** Nomor saja pattern */
export const NOMOR_ONLY_REGEX = /^\s*(\d+)\s*$/m;

/** TENTANG pattern */
export const TENTANG_REGEX = /TENTANG\s+([\s\S]+?)(?=\s*(?:Menimbang|DENGAN|$))/i;

// ============== PREAMBULE ==============

/** Menimbang pattern - allow leading whitespace for pdfplumber */
export const MENIMBANG_REGEX = /^\s*Menimbang\s*:/im;

/** Mengingat pattern - allow leading whitespace */
export const MENGINGAT_REGEX = /^\s*Mengingat\s*:/im;

/** MEMUTUSKAN pattern - allow leading whitespace */
export const MEMUTUSKAN_REGEX = /^\s*MEMUTUSKAN\s*:/im;

/** Menetapkan pattern - allow leading whitespace */
export const MENETAPKAN_REGEX = /^\s*Menetapkan\s*:/im;

// ============== PASAL & AYAT ==============

/** Pasal pattern (batang tubuh) */
export const PASAL_REGEX = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/im;
export const PASAL_GLOBAL_REGEX = /(?:^|\n)\s*Pasal\s+(\d+[A-Z]?)\b/gim;

/** Ayat pattern - e.g., "(1)" at start of line - allow leading whitespace */
export const AYAT_REGEX = /^\s*\((\d+)\)\s+/m;
export const AYAT_GLOBAL_REGEX = /^\s*\((\d+)\)\s+/gm;

// ============== PENUTUP ==============

/** Agar setiap orang mengetahuinya pattern */
export const AGAR_SETIAP_ORANG_REGEX = /Agar\s+setiap\s+orang\s+mengetahuinya/i;

/** Ditetapkan pattern - allow leading whitespace */
export const DITETAPKAN_REGEX = /^\s*Ditetapkan\s+di\s+(\w+)/im;

/** Diundangkan pattern - allow leading whitespace */
export const DIUNDANGKAN_REGEX = /^\s*Diundangkan\s+di\s+(\w+)/im;

/** LEMBARAN NEGARA pattern */
export const LEMBARAN_NEGARA_REGEX = /LEMBARAN\s+NEGARA\s+REPUBLIK\s+INDONESIA/i;

// ============== PENJELASAN ==============

/** Penjelasan header pattern - allow leading whitespace */
export const PENJELASAN_REGEX = /^\s*PENJELASAN\b/im;
export const PENJELASAN_ATAS_REGEX = /^\s*PENJELASAN\s+ATAS\b/im;

/** I. UMUM pattern - allow leading whitespace */
export const UMUM_REGEX = /^\s*I\.\s*UMUM\b/im;

/** II. PASAL DEMI PASAL pattern - allow leading whitespace */
export const PASAL_DEMI_PASAL_REGEX = /^\s*II\.\s*PASAL\s+DEMI\s+PASAL\b/im;

/** Pasal pattern dalam Penjelasan - allow leading whitespace */
export const PENJELASAN_PASAL_REGEX = /^\s*Pasal\s+(\d+[A-Z]?)\b/im;
export const PENJELASAN_PASAL_GLOBAL_REGEX = /^\s*Pasal\s+(\d+[A-Z]?)\b/gim;

/** Ayat pattern dalam Penjelasan - "Ayat (1)" - allow leading whitespace */
export const PENJELASAN_AYAT_REGEX = /^\s*Ayat\s+\((\d+)\)/im;
export const PENJELASAN_AYAT_GLOBAL_REGEX = /^\s*Ayat\s+\((\d+)\)/gim;

/** Huruf pattern dalam Penjelasan - "Huruf a" - allow leading whitespace */
export const PENJELASAN_HURUF_REGEX = /^\s*Huruf\s+([a-z])/im;
export const PENJELASAN_HURUF_GLOBAL_REGEX = /^\s*Huruf\s+([a-z])/gim;

/** Cukup jelas pattern */
export const CUKUP_JELAS_REGEX = /Cukup\s+jelas/i;

// ============== TANGGAL ==============

/** Tanggal ditetapkan pattern */
export const TANGGAL_DITETAPKAN_REGEX = /Ditetapkan\s+di\s+\w+[\s\S]*?pada\s+tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i;

/** Tanggal diundangkan pattern */
export const TANGGAL_DIUNDANGKAN_REGEX = /Diundangkan\s+di\s+\w+[\s\S]*?pada\s+tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i;

// ============== LEGAL REFERENCES ==============

/** Legal reference pattern */
export const LEGAL_REF_REGEX = /(?:Pasal\s+\d+[A-Z]?(?:\s+ayat\s*\(\d+\))?|Undang-Undang\s+(?:Nomor|No\.?)\s*\d+|Peraturan\s+Pemerintah\s+(?:Nomor|No\.?)\s*\d+|PP\s+(?:Nomor|No\.?)\s*\d+)/gi;

// ============== CLEANUP ==============

/** Page number pattern */
export const PAGE_NUMBER_REGEX = /^\s*-?\s*\d+\s*-?\s*$/gm;

/** Page header/footer pattern */
export const PAGE_HEADER_REGEX = /^.*(?:PERATURAN\s+PEMERINTAH|LEMBARAN\s+NEGARA).*-\s*\d+\s*-.*$/gim;
