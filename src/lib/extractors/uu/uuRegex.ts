/**
 * UU Regex Patterns - Regular expressions for UU (Undang-Undang) document parsing
 * Structure is identical to PERPU (BAB → Bagian → Paragraf → Pasal → Ayat)
 */

// ============== HEADER & IDENTITY ==============

/** UU Header pattern */
export const UU_HEADER_REGEX = /UNDANG[-\s]?UNDANG\s+(?:REPUBLIK\s+INDONESIA\s+)?/i;

/** UU Nomor pattern - e.g., "NOMOR 1 TAHUN 2020" */
export const UU_NOMOR_REGEX = /NOMOR\s+(\d+)\s+TAHUN\s+(\d{4})/i;

/** TENTANG pattern */
export const TENTANG_REGEX = /TENTANG\s+([\s\S]+?)(?=\s*(?:Menimbang|DENGAN|$))/i;

// ============== PREAMBULE ==============

/** Dengan Rahmat Tuhan - typical UU header */
export const DENGAN_RAHMAT_REGEX = /^DENGAN\s+RAHMAT\s+TUHAN\s+YANG\s+MAHA\s+ESA\b/im;

/** Presiden Republik Indonesia */
export const PRESIDEN_REGEX = /^PRESIDEN\s+REPUBLIK\s+INDONESIA\s*,?\s*$/im;

/** Menimbang pattern - colon optional */
export const MENIMBANG_REGEX = /(?:^|\n)\s*Menimbang\s*:?/im;

/** Mengingat pattern - colon optional */
export const MENGINGAT_REGEX = /(?:^|\n)\s*Mengingat\s*:?/im;

/** MEMUTUSKAN pattern - colon optional */
export const MEMUTUSKAN_REGEX = /(?:^|\n)\s*MEMUTUSKAN\s*:?/im;

/** Menetapkan pattern - colon optional */
export const MENETAPKAN_REGEX = /(?:^|\n)\s*Menetapkan\s*:?/im;

// ============== BATANG TUBUH (UU hierarchy) ==============

/** BAB pattern - e.g., "BAB I", "BAB XIV" */
export const BAB_REGEX = /^\s*BAB\s+([IVXLCDM]+)\b/im;
export const BAB_GLOBAL_REGEX = /^\s*BAB\s+([IVXLCDM]+)\b/gim;

/** Bagian pattern - e.g., "Bagian Kesatu", "Bagian Kedua" */
export const BAGIAN_REGEX = /^\s*Bagian\s+(Kesatu|Kedua|Ketiga|Keempat|Kelima|Keenam|Ketujuh|Kedelapan|Kesembilan|Kesepuluh|Kesebelas|Kedua\s+Belas|Ketiga\s+Belas|[\w\s]+)\b/im;
export const BAGIAN_GLOBAL_REGEX = /^\s*Bagian\s+(Kesatu|Kedua|Ketiga|Keempat|Kelima|Keenam|Ketujuh|Kedelapan|Kesembilan|Kesepuluh|Kesebelas|Kedua\s+Belas|Ketiga\s+Belas|[\w\s]+)\b/gim;

/** Paragraf pattern - e.g., "Paragraf 1", "Paragraf 2" */
export const PARAGRAF_REGEX = /^\s*Paragraf\s+(\d+)\b/im;
export const PARAGRAF_GLOBAL_REGEX = /^\s*Paragraf\s+(\d+)\b/gim;

/** Pasal pattern (batang tubuh) - handles optional quotes before Pasal */
export const PASAL_REGEX = /(?:^|\n)\s*["']?\s*Pasal\s+(\d+[A-Z]?)\b/im;
export const PASAL_GLOBAL_REGEX = /(?:^|\n)\s*["']?\s*Pasal\s+(\d+[A-Z]?)\b/gim;

/** Ayat pattern - e.g., "(1)" at start of line */
export const AYAT_REGEX = /^\s*\((\d+)\)\s+/m;
export const AYAT_GLOBAL_REGEX = /^\s*\((\d+)\)\s+/gm;

/** Huruf pattern - e.g., "a." at start of line */
export const HURUF_REGEX = /^\s*([a-z])\.\s+/m;
export const HURUF_GLOBAL_REGEX = /^\s*([a-z])\.\s+/gm;

// ============== PENUTUP ==============

/** Agar setiap orang mengetahuinya pattern */
export const AGAR_SETIAP_ORANG_REGEX = /Agar\s+setiap\s+orang\s+mengetahuinya/i;

/** Ditetapkan pattern */
export const DITETAPKAN_REGEX = /^\s*Ditetapkan\s+di\s+(\w+)/im;

/** Diundangkan pattern */
export const DIUNDANGKAN_REGEX = /^\s*Diundangkan\s+di\s+(\w+)/im;

/** LEMBARAN NEGARA pattern */
export const LEMBARAN_NEGARA_REGEX = /LEMBARAN\s+NEGARA\s+REPUBLIK\s+INDONESIA/i;

// ============== PENJELASAN ==============

/** Penjelasan header pattern - UU-specific */
export const PENJELASAN_REGEX = /^\s*PENJELASAN\b/im;
export const PENJELASAN_ATAS_UU_REGEX = /^\s*PENJELASAN\s+ATAS\s+UNDANG[-\s]?UNDANG\b/im;

/** I. UMUM pattern */
export const UMUM_REGEX = /^\s*I\.\s*UMUM\b/im;

/** II. PASAL DEMI PASAL pattern */
export const PASAL_DEMI_PASAL_REGEX = /^\s*II\.\s*PASAL\s+DEMI\s+PASAL\b/im;

/** Pasal pattern dalam Penjelasan */
export const PENJELASAN_PASAL_REGEX = /^\s*Pasal\s+(\d+[A-Z]?)\b/im;
export const PENJELASAN_PASAL_GLOBAL_REGEX = /^\s*Pasal\s+(\d+[A-Z]?)\b/gim;

/** Ayat pattern dalam Penjelasan - "Ayat (1)" */
export const PENJELASAN_AYAT_REGEX = /^\s*Ayat\s+\((\d+)\)/im;
export const PENJELASAN_AYAT_GLOBAL_REGEX = /^\s*Ayat\s+\((\d+)\)/gim;

/** Cukup jelas pattern */
export const CUKUP_JELAS_REGEX = /Cukup\s+jelas/i;

// ============== TANGGAL ==============

/** Tanggal ditetapkan pattern */
export const TANGGAL_DITETAPKAN_REGEX = /Ditetapkan\s+di\s+\w+[\s\S]*?pada\s+tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i;

/** Tanggal diundangkan pattern */
export const TANGGAL_DIUNDANGKAN_REGEX = /Diundangkan\s+di\s+\w+[\s\S]*?pada\s+tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i;

// ============== LEGAL REFERENCES ==============

/** Legal reference pattern */
export const LEGAL_REF_REGEX = /(?:Pasal\s+\d+[A-Z]?(?:\s+ayat\s*\(\d+\))?|Undang-Undang\s+(?:Nomor|No\.?)\s*\d+|Peraturan\s+Pemerintah\s+(?:Nomor|No\.?)\s*\d+|UU\s+(?:Nomor|No\.?)\s*\d+|PP\s+(?:Nomor|No\.?)\s*\d+)/gi;

// ============== CLEANUP ==============

/** Page number pattern */
export const PAGE_NUMBER_REGEX = /^\s*-?\s*\d+\s*-?\s*$/gm;

/** Page header/footer pattern for UU */
export const PAGE_HEADER_REGEX = /^.*(?:UNDANG[-\s]?UNDANG|LEMBARAN\s+NEGARA).*-\s*\d+\s*-.*$/gim;
