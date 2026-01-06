import * as fs from 'fs/promises';
import path from 'path';

// Maximum characters to extract for performance
const MAX_CHARS = 10000;

/**
 * Extract text from a PDF file
 */
export async function extractPdfText(filePath: string): Promise<string> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParseModule = await import('pdf-parse') as any;
        const pdfParse = pdfParseModule.default || pdfParseModule;
        const buffer = await fs.readFile(filePath);
        const data = await pdfParse(buffer, {
            max: 2, // Only first 2 pages
        });
        return data.text.substring(0, MAX_CHARS);
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error(`Failed to extract PDF text: ${(error as Error).message}`);
    }
}

/**
 * Extract text from an HTML file
 */
export async function extractHtmlText(filePath: string): Promise<string> {
    try {
        const { load } = await import('cheerio');
        const html = await fs.readFile(filePath, 'utf-8');
        const $ = load(html);

        // Remove script and style elements
        $('script, style, noscript').remove();

        // Get text content
        const text = $('body').text() || $.root().text();

        // Clean up whitespace
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, MAX_CHARS);
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
        return text.substring(0, MAX_CHARS);
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
