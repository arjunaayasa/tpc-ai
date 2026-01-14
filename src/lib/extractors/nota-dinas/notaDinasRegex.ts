/**
 * Nota Dinas Regex Patterns - Regular expressions for Nota Dinas document parsing
 */

// ============== HEADER & IDENTITY ==============

/** Nota Dinas Header pattern */
export const NOTA_DINAS_HEADER_REGEX = /NOTA\s+DINAS/i;

/** Nota Dinas Nomor pattern - e.g., "NOMOR ND-6/PJ.01/2021" or "ND-14/PJ/2024" */
export const ND_NOMOR_REGEX = /(?:NOMOR\s+)?(ND\s*[-.]?\s*\d+[A-Z]?\/[A-Z0-9.\/]+\/\d{4})/i;

/** Yth (Kepada) pattern */
export const YTH_REGEX = /^Yth\.?\s*[:\.]?\s*([\s\S]+?)(?=\n(?:Dari|Sifat|Hal|Tanggal|Lampiran|\d+\.))/im;

/** Dari pattern */
export const DARI_REGEX = /^Dari\s*[:\.]?\s*([\s\S]+?)(?=\n(?:Sifat|Hal|Tanggal|Lampiran|Yth|\d+\.))/im;

/** Sifat pattern */
export const SIFAT_REGEX = /^Sifat\s*[:\.]?\s*(.+)/im;

/** Hal pattern */
export const HAL_REGEX = /^Hal\s*[:\.]?\s*([\s\S]+?)(?=\n(?:Dari|Sifat|Tanggal|Lampiran|Yth|Sehubungan|\d+\.))/im;

/** Tanggal pattern */
export const TANGGAL_REGEX = /^Tanggal\s*[:\.]?\s*(.+)/im;

/** Lampiran pattern */
export const LAMPIRAN_COUNT_REGEX = /^Lampiran\s*[:\.]?\s*(.+)/im;

// ============== PEMBUKA ==============

/** Sehubungan dengan pattern - allow leading whitespace for pdfplumber */
export const SEHUBUNGAN_REGEX = /^\s*Sehubungan\s+dengan\b/im;

/** Menindaklanjuti pattern - allow leading whitespace */
export const MENINDAKLANJUTI_REGEX = /^\s*Menindaklanjuti\b/im;

/** Berdasarkan pattern - allow leading whitespace */
export const BERDASARKAN_REGEX = /^\s*Berdasarkan\b/im;

/** Merujuk pada pattern - allow leading whitespace */
export const MERUJUK_REGEX = /^\s*Merujuk\s+(?:pada|kepada)\b/im;

// ============== ISI POKOK ==============

/** Numbered item pattern - e.g., "1.", "2.", "10." - allow leading whitespace */
export const NUMBERED_ITEM_REGEX = /^\s*(\d+)\.\s+/m;
export const NUMBERED_ITEM_GLOBAL_REGEX = /^\s*(\d+)\.\s+/gm;

/** Lettered sub-item pattern - e.g., "a.", "b.", "c." - allow leading whitespace */
export const LETTERED_SUBITEM_REGEX = /^\s*([a-z])\.\s+/m;
export const LETTERED_SUBITEM_GLOBAL_REGEX = /^\s*([a-z])\.\s+/gm;

/** Numbered sub-sub-item pattern - e.g., "1)", "2)", "3)" - allow leading whitespace */
export const NUMBERED_SUBSUBITEM_REGEX = /^\s*(\d+)\)\s+/m;
export const NUMBERED_SUBSUBITEM_GLOBAL_REGEX = /^\s*(\d+)\)\s+/gm;

/** Roman numeral item pattern - e.g., "I.", "II.", "III." - allow leading whitespace */
export const ROMAN_ITEM_REGEX = /^\s*([IVXLC]+)\.\s+/m;
export const ROMAN_ITEM_GLOBAL_REGEX = /^\s*([IVXLC]+)\.\s+/gm;

// ============== PENEGASAN ==============

/** Dengan penegasan ini pattern - allow leading whitespace */
export const DENGAN_PENEGASAN_REGEX = /^\s*Dengan\s+penegasan\s+ini\b/im;

/** Hal-hal yang perlu diperhatikan pattern - allow leading whitespace */
export const HAL_HAL_REGEX = /^\s*Hal[- ]hal\s+yang\s+perlu\s+(?:diperhatikan|diketahui)\b/im;

// ============== PENUTUP ==============

/** Demikian pattern - allow leading whitespace */
export const DEMIKIAN_REGEX = /^\s*Demikian\s+(?:disampaikan|untuk|agar|kami|nota)\b/im;

/** a.n. Direktur pattern - allow leading whitespace */
export const AN_DIREKTUR_REGEX = /^\s*a\.?\s*n\.?\s*(?:Direktur|Kepala)\b/im;

/** Tembusan pattern - allow leading whitespace */
export const TEMBUSAN_REGEX = /^\s*Tembusan\s*:/im;

/** Ditetapkan pattern - allow leading whitespace */
export const DITETAPKAN_REGEX = /^\s*(?:Jakarta|Ditetapkan\s+di)\b/im;

// ============== LAMPIRAN ==============

/** Lampiran header pattern - allow leading whitespace */
export const LAMPIRAN_HEADER_REGEX = /^\s*LAMPIRAN\b/im;

/** Lampiran lettered section pattern - e.g., "A.", "B.", "C." - allow leading whitespace */
export const LAMPIRAN_LETTER_REGEX = /^\s*([A-Z])\.\s+/m;
export const LAMPIRAN_LETTER_GLOBAL_REGEX = /^\s*([A-Z])\.\s+/gm;

// ============== LEGAL REFERENCES ==============

/** Legal reference pattern */
export const LEGAL_REF_REGEX = /(?:ND\s*[-.]?\s*\d+\/[A-Z0-9.\\/]+|SE\s*[-.]?\s*\d+\/[A-Z0-9.\\/]+|UU\s+(?:Nomor|No\.?)\s*\d+|PP\s+(?:Nomor|No\.?)\s*\d+|PMK\s+(?:Nomor|No\.?)\s*[\d\\/]+|PER\s*[-.]?\s*\d+\/PJ\/\d{4}|Pasal\s+\d+[A-Z]?)/gi;

// ============== CLEANUP ==============

/** Page number pattern */
export const PAGE_NUMBER_REGEX = /^\s*-?\s*\d+\s*-?\s*$/gm;

/** Page header/footer pattern */
export const PAGE_HEADER_REGEX = /^.*NOTA\s+DINAS.*-\s*\d+\s*-.*$/gim;
