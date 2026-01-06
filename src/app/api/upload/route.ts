import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { saveUploadedFile, isValidFileType } from '@/lib/upload';
import { getExtractionQueue } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
            return NextResponse.json(
                { error: 'File is required' },
                { status: 400 }
            );
        }

        // Validate file type
        if (!isValidFileType(file.name)) {
            return NextResponse.json(
                { error: 'Invalid file type. Allowed: PDF, HTML, TXT' },
                { status: 400 }
            );
        }

        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            return NextResponse.json(
                { error: 'File too large. Maximum size is 50MB' },
                { status: 400 }
            );
        }

        // Save file to disk
        const uploadResult = await saveUploadedFile(file, file.name);

        // Check for duplicate SHA256
        const existing = await prisma.document.findUnique({
            where: { sha256: uploadResult.sha256 },
        });

        if (existing) {
            return NextResponse.json(
                {
                    error: 'Duplicate file detected',
                    existingDocumentId: existing.id,
                },
                { status: 409 }
            );
        }

        // Create document record
        const document = await prisma.document.create({
            data: {
                fileName: uploadResult.fileName,
                originalName: uploadResult.originalName,
                mimeType: uploadResult.mimeType,
                filePath: uploadResult.filePath,
                sha256: uploadResult.sha256,
                status: 'uploaded',
            },
        });

        // Enqueue extraction job
        const queue = getExtractionQueue();
        await queue.add('extract_metadata', { documentId: document.id }, {
            jobId: `extract-${document.id}`,
        });

        return NextResponse.json({
            success: true,
            documentId: document.id,
            message: 'File uploaded successfully. Extraction job queued.',
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Upload failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}
