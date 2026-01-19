import * as fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

// No character limit - process full documents
// const MAX_CHARS = 500000; // REMOVED - was causing truncation of large documents

// Quality threshold - below this, use pdfplumber fallback
const QUALITY_THRESHOLD = 0.75;

/**
 * Detect text quality based on word patterns
 * Returns a score 0-1 (higher = better quality)
 */
function detectTextQuality(text: string): { score: number; issues: string[] } {
    const issues: string[] = [];
    let score = 1.0;

    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) {
        return { score: 0, issues: ['No words extracted'] };
    }

    // Check for very long "words" (concatenated text)
    const longWords = words.filter(w => w.length > 25 && /[a-zA-Z]/.test(w));
    if (longWords.length > 20) {
        score -= 0.4;
        issues.push(`${longWords.length} very long words (likely concatenated)`);
    } else if (longWords.length > 5) {
        score -= 0.2;
        issues.push(`${longWords.length} long words detected`);
    }

    // Check average word length (Indonesian averages ~7-8 chars)
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    if (avgWordLength > 15) {
        score -= 0.3;
        issues.push(`High avg word length: ${avgWordLength.toFixed(1)}`);
    } else if (avgWordLength > 12) {
        score -= 0.15;
        issues.push(`Elevated avg word length: ${avgWordLength.toFixed(1)}`);
    }

    // Check for common concatenation patterns
    const concatPatterns = text.match(/[a-z][A-Z]/g) || [];
    const concatRatio = concatPatterns.length / words.length;
    if (concatRatio > 0.1) {
        score -= 0.2;
        issues.push(`High camelCase ratio: ${(concatRatio * 100).toFixed(1)}%`);
    }

    return { score: Math.max(0, score), issues };
}

/**
 * Extract text using pdfplumber (Python) - higher quality but slower
 */
async function extractWithPdfplumber(filePath: string): Promise<string> {
    const scriptPath = path.join(process.cwd(), 'scripts', 'extract_pdf.py');

    // Try to use Python from venv first, fallback to system python
    const venvPython = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const pythonCmd = require('fs').existsSync(venvPython) ? `"${venvPython}"` : 'python';

    try {
        // Run Python script
        const result = execSync(`${pythonCmd} "${scriptPath}" "${filePath}"`, {
            encoding: 'utf-8',
            maxBuffer: 100 * 1024 * 1024, // 100MB buffer
            timeout: 120000, // 2 minute timeout
        });

        const parsed = JSON.parse(result);

        if (!parsed.success) {
            throw new Error(parsed.error || 'pdfplumber extraction failed');
        }

        console.log(`[Extraction] pdfplumber extracted ${parsed.chars} chars from ${parsed.pages} pages`);
        return parsed.text;
    } catch (error) {
        console.error('[Extraction] pdfplumber failed:', error);
        throw error;
    }
}

/**
 * Extract text from scanned PDF using Tesseract OCR
 * Requires: Tesseract OCR and Poppler installed
 */
async function extractWithOcr(filePath: string): Promise<{ text: string; quality: number }> {
    const scriptPath = path.join(process.cwd(), 'scripts', 'ocr_pdf.py');

    if (!require('fs').existsSync(scriptPath)) {
        throw new Error('OCR script not found at ' + scriptPath);
    }

    // Try to use Python from venv first, fallback to system python
    const venvPython = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const pythonCmd = require('fs').existsSync(venvPython) ? `"${venvPython}"` : 'python';

    try {
        // Run OCR Python script (longer timeout for OCR)
        const result = execSync(`${pythonCmd} "${scriptPath}" "${filePath}"`, {
            encoding: 'utf-8',
            maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large OCR result
            timeout: 600000, // 10 minute timeout for OCR
        });

        const parsed = JSON.parse(result);

        if (!parsed.success) {
            throw new Error(parsed.error || 'OCR extraction failed');
        }

        console.log(`[Extraction] OCR extracted ${parsed.chars} chars from ${parsed.pages} pages (quality: ${(parsed.quality * 100).toFixed(0)}%)`);
        return { text: parsed.text, quality: parsed.quality };
    } catch (error) {
        console.error('[Extraction] OCR failed:', error);
        throw error;
    }
}

/**
 * Extract text from a PDF file with improved spacing handling
 * Uses hybrid approach: pdf-parse first, fallback to pdfplumber if quality is low
 * Final fallback: OCR for scanned PDFs with no text layer
 */
export async function extractPdfText(filePath: string): Promise<string> {
    try {
        // Use require for pdf-parse as it works better with CommonJS
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');
        const buffer = await fs.readFile(filePath);

        // Custom page renderer to better preserve spacing
        const options = {
            // Preserve more layout information
            pagerender: function (pageData: any) {
                const textContent = pageData.getTextContent();
                return textContent.then(function (content: any) {
                    let text = '';
                    let lastY = -1;
                    let lastX = -1;

                    for (const item of content.items) {
                        if ('str' in item) {
                            const currentY = item.transform[5];
                            const currentX = item.transform[4];

                            // New line detection
                            if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
                                text += '\n';
                                lastX = -1;
                            }
                            // Space detection between text items on same line
                            else if (lastX !== -1 && currentX - lastX > 5) {
                                text += ' ';
                            }

                            text += item.str;
                            lastY = currentY;
                            lastX = currentX + (item.width || 0);
                        }
                    }
                    return text;
                });
            }
        };

        const data = await pdfParse(buffer, options);
        let text = data.text;

        // Post-processing to fix common spacing issues
        text = fixPdfTextSpacing(text);

        // Check quality of extracted text
        const quality = detectTextQuality(text);
        console.log(`[Extraction] pdf-parse quality: ${(quality.score * 100).toFixed(0)}%${quality.issues.length > 0 ? ' - ' + quality.issues.join(', ') : ''}`);

        // Track all extraction attempts for comparison
        let bestText = text;
        let bestQuality = quality.score;
        let bestMethod = 'pdf-parse';

        // If quality is low, try pdfplumber fallback
        if (quality.score < QUALITY_THRESHOLD) {
            console.log(`[Extraction] Quality below threshold (${(QUALITY_THRESHOLD * 100).toFixed(0)}%), trying pdfplumber...`);
            try {
                const pdfplumberText = await extractWithPdfplumber(filePath);
                const pdfplumberQuality = detectTextQuality(pdfplumberText);
                console.log(`[Extraction] pdfplumber quality: ${(pdfplumberQuality.score * 100).toFixed(0)}%`);

                // Update best if pdfplumber is better
                if (pdfplumberQuality.score > bestQuality) {
                    bestText = fixPdfTextSpacing(pdfplumberText);
                    bestQuality = pdfplumberQuality.score;
                    bestMethod = 'pdfplumber';
                }
            } catch (pdfplumberError) {
                console.warn(`[Extraction] pdfplumber fallback failed:`, pdfplumberError);
            }

            // If still below threshold, try OCR
            if (bestQuality < QUALITY_THRESHOLD) {
                console.log(`[Extraction] Quality still below threshold (${(bestQuality * 100).toFixed(0)}%), trying OCR...`);
                try {
                    const ocrResult = await extractWithOcr(filePath);
                    if (ocrResult.text && ocrResult.text.trim().length > 50) {
                        // Use OCR's built-in quality (from Tesseract confidence) - it's more accurate for OCR
                        const ocrDetectedQuality = detectTextQuality(ocrResult.text);
                        // Use the higher of OCR's built-in quality or detected quality
                        const effectiveOcrQuality = Math.max(ocrResult.quality, ocrDetectedQuality.score);
                        console.log(`[Extraction] OCR quality: ${(effectiveOcrQuality * 100).toFixed(0)}% (OCR: ${(ocrResult.quality * 100).toFixed(0)}%, detected: ${(ocrDetectedQuality.score * 100).toFixed(0)}%)`);

                        // Update best if OCR is better
                        if (effectiveOcrQuality > bestQuality) {
                            bestText = fixPdfTextSpacing(ocrResult.text);
                            bestQuality = effectiveOcrQuality;
                            bestMethod = 'ocr';
                        }
                    }
                } catch (ocrError) {
                    console.warn(`[Extraction] OCR fallback failed:`, ocrError);
                }
            }

            // Log final decision
            console.log(`[Extraction] Using ${bestMethod} result (quality: ${(bestQuality * 100).toFixed(0)}%)`);
            text = bestText;
        }

        // Final fallback: OCR for scanned PDFs (when text is empty or minimal)
        const trimmedText = text.trim();
        if (trimmedText.length < 100) {
            console.log(`[Extraction] Text too short (${trimmedText.length} chars), trying OCR for scanned PDF...`);
            try {
                const ocrResult = await extractWithOcr(filePath);
                if (ocrResult.text && ocrResult.text.trim().length > trimmedText.length) {
                    console.log(`[Extraction] Using OCR result (${ocrResult.text.trim().length} chars)`);
                    text = ocrResult.text;
                }
            } catch (ocrError) {
                console.warn(`[Extraction] OCR fallback failed:`, ocrError);
                // Keep whatever text we have (even if empty)
            }
        }

        return text;
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error(`Failed to extract PDF text: ${(error as Error).message}`);
    }
}

/**
 * Post-process PDF text to fix common spacing issues
 */
function fixPdfTextSpacing(text: string): string {
    let result = text;

    // Fix common concatenation patterns
    // Add space between lowercase and uppercase (camelCase-like joins)
    result = result.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Add space before common Indonesian words that are often concatenated
    const commonWords = [
        'dengan', 'bahwa', 'yang', 'untuk', 'dalam', 'atas', 'atau', 'dan',
        'pada', 'dari', 'oleh', 'kepada', 'sebagai', 'tersebut', 'berdasarkan',
        'sesuai', 'tentang', 'antara', 'melalui', 'terhadap', 'mengenai',
        'Sehubungan', 'Menindaklanjuti', 'Berdasarkan', 'Demikian', 'Dengan',
        'Undang', 'Nomor', 'Tahun', 'Pasal', 'ayat', 'huruf', 'Peraturan',
        'Menteri', 'Direktur', 'Jenderal', 'Pajak', 'perpajakan', 'penghasilan'
    ];

    for (const word of commonWords) {
        // Add space before the word if preceded by lowercase letter
        const pattern = new RegExp(`([a-z])${word}`, 'g');
        result = result.replace(pattern, `$1 ${word}`);
    }

    // Fix number-word concatenation (e.g., "2020tentang" -> "2020 tentang")
    result = result.replace(/(\d)([a-zA-Z])/g, '$1 $2');
    result = result.replace(/([a-zA-Z])(\d)/g, '$1 $2');

    // Fix punctuation spacing
    result = result.replace(/([;:,])([a-zA-Z])/g, '$1 $2');

    // Remove excessive spaces
    result = result.replace(/  +/g, ' ');

    // Fix line breaks
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

    return result.trim();
}

/**
 * Extract text from an HTML file
 */
export async function extractHtmlText(filePath: string): Promise<string> {
    try {
        const cheerio = await import('cheerio');
        const html = await fs.readFile(filePath, 'utf-8');
        const $ = cheerio.load(html);

        // Remove script and style elements
        $('script, style, noscript').remove();

        // Get text content
        const text = $('body').text() || $.root().text();

        // Clean up whitespace
        return text
            .replace(/\s+/g, ' ')
            .trim();
    } catch (error) {
        console.error('HTML extraction error:', error);
        throw new Error(`Failed to extract HTML text: ${(error as Error).message}`);
    }
}

/**
 * Extract text from a TXT file
 */
export async function extractTxtText(filePath: string): Promise<string> {
    try {
        const text = await fs.readFile(filePath, 'utf-8');
        return text;
    } catch (error) {
        console.error('TXT extraction error:', error);
        throw new Error(`Failed to read TXT file: ${(error as Error).message}`);
    }
}

/**
 * Extract text based on file type
 */
export async function extractText(filePath: string, mimeType: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    if (mimeType === 'application/pdf' || ext === '.pdf') {
        return extractPdfText(filePath);
    }

    if (mimeType === 'text/html' || ext === '.html' || ext === '.htm') {
        return extractHtmlText(filePath);
    }

    if (mimeType === 'text/plain' || ext === '.txt') {
        return extractTxtText(filePath);
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
}
