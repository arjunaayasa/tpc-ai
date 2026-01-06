import { createWriteStream, promises as fs } from 'fs';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { Readable } from 'stream';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export interface UploadResult {
    fileName: string;
    originalName: string;
    filePath: string;
    mimeType: string;
    sha256: string;
}

/**
 * Ensure upload directory exists
 */
export async function ensureUploadDir(): Promise<void> {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Generate a unique filename using UUID
 */
export function generateUniqueFileName(originalName: string): string {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    return `${uuidv4()}_${sanitizedBase}${ext}`;
}

/**
 * Save uploaded file using streaming and calculate SHA256
 */
export async function saveUploadedFile(
    file: File,
    originalName: string
): Promise<UploadResult> {
    await ensureUploadDir();

    const fileName = generateUniqueFileName(originalName);
    const filePath = path.join(UPLOAD_DIR, fileName);
    const absolutePath = path.resolve(filePath);

    // Create hash calculator
    const hash = createHash('sha256');

    // Convert File to stream and pipe to file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Calculate hash
    hash.update(buffer);
    const sha256 = hash.digest('hex');

    // Write file
    await fs.writeFile(absolutePath, buffer);

    return {
        fileName,
        originalName,
        filePath: absolutePath,
        mimeType: file.type || getMimeType(originalName),
        sha256,
    };
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Validate file type
 */
export function isValidFileType(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.pdf', '.html', '.htm', '.txt'].includes(ext);
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch (error) {
        // Ignore if file doesn't exist
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
}
