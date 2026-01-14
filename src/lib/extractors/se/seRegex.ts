/**
 * SE Regex Patterns - Regular expressions for SE document parsing
 */

// ============== HEADER & IDENTITY ==============

/** SE Header pattern */
export const SE_HEADER_REGEX = /SURAT\s+EDARAN\s+DIREKTUR\s+JENDERAL\s+PAJAK/i;

/** SE Nomor pattern - e.g., "NOMOR SE-11/PJ.42/1992" or "SE-05/PJ.43/2002" */
export const SE_NOMOR_REGEX = /(?:NOMOR\s+)?SE\s*[-.]?\s*([0-9]+[A-Z]?)\/([A-Z0-9.]+)\/(\d{4})/i;

/** TENTANG pattern */
export const TENTANG_REGEX = /TENTANG\s+([\s\S]+?)(?=\s*(?:$|Sehubungan|Sesuai|Bersama|Dengan\s+ini|Yth|Kepada))/i;

// ============== PEMBUKA ==============

/** Sehubungan dengan pattern - allow leading whitespace for pdfplumber */
export const SEHUBUNGAN_REGEX = /^\s*Sehubungan\s+dengan\b/im;

/** Sesuai dengan pattern - allow leading whitespace */
export const SESUAI_REGEX = /^\s*Sesuai\s+dengan\b/im;

/** Bersama ini disampaikan pattern - allow leading whitespace */
export const BERSAMA_INI_REGEX = /^\s*Bersama\s+ini\s+disampaikan\b/im;

/** Dengan ini pattern - allow leading whitespace */
export const DENGAN_INI_REGEX = /^\s*Dengan\s+ini\b/im;

// ============== ISI POKOK ==============

/** Numbered item pattern - e.g., "1.", "2.", "10." - allow leading whitespace */
export const NUMBERED_ITEM_REGEX = /^\s*(\d+)\.\s+/m;
export const NUMBERED_ITEM_GLOBAL_REGEX = /^\s*(\d+)\.\s+/gm;

/** Lettered sub-item pattern - e.g., "a.", "b.", "c." - allow leading whitespace */
export const LETTERED_SUBITEM_REGEX = /^\s*([a-z])\.\s+/m;
export const LETTERED_SUBITEM_GLOBAL_REGEX = /^\s*([a-z])\.\s+/gm;

/** Roman numeral item pattern - e.g., "I.", "II.", "III." - allow leading whitespace */
export const ROMAN_ITEM_REGEX = /^\s*([IVXLC]+)\.\s+/m;
export const ROMAN_ITEM_GLOBAL_REGEX = /^\s*([IVXLC]+)\.\s+/gm;

// ============== PENUTUP ==============

/** Dengan penegasan ini pattern - allow leading whitespace */
export const DENGAN_PENEGASAN_REGEX = /^\s*Dengan\s+penegasan\s+ini\b/im;

/** Agar setiap orang mengetahuinya pattern */
export const AGAR_SETIAP_ORANG_REGEX = /Agar\s+setiap\s+orang\s+mengetahuinya/i;

/** Demikian pattern - allow leading whitespace */
export const DEMIKIAN_REGEX = /^\s*Demikian\s+(?:disampaikan|untuk|agar)\b/im;

/** Ditetapkan pattern - allow leading whitespace */
export const DITETAPKAN_REGEX = /^\s*Ditetapkan\s+di\b/im;

// ============== LEGAL REFERENCES ==============

/** Legal reference pattern */
export const LEGAL_REF_REGEX = /(?:SE[\s-]*\d+\/[A-Z0-9.\/]+|UU\s+(?:Nomor|No\.?)\s*\d+|PP\s+(?:Nomor|No\.?)\s*\d+|PMK\s+(?:Nomor|No\.?)\s*[\d\/]+|PER[\s-]*\d+\/PJ\/\d{4}|Pasal\s+\d+[A-Z]?)/gi;

// ============== CLEANUP ==============

/** Page number pattern */
export const PAGE_NUMBER_REGEX = /^\s*-?\s*\d+\s*-?\s*$/gm;

/** Page header/footer pattern */
export const PAGE_HEADER_REGEX = /^.*SURAT\s+EDARAN.*-\s*\d+\s*-.*$/gim;
