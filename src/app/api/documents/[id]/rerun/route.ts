import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getExtractionQueue } from '@/lib/queue';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Validate document exists
        const document = await prisma.document.findUnique({
            where: { id },
        });

        if (!document) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        // Update status to processing
        await prisma.document.update({
            where: { id },
            data: {
                status: 'processing',
                lastError: null,
            },
        });

        // Enqueue extraction job
        const queue = getExtractionQueue();
        await queue.add('extract_metadata', { documentId: id }, {
            jobId: `extract-${id}-${Date.now()}`,
        });

        return NextResponse.json({
            success: true,
            message: 'Re-extraction job queued',
        });
    } catch (error) {
        console.error('Re-run extraction error:', error);
        return NextResponse.json(
            { error: 'Failed to queue extraction', details: (error as Error).message },
            { status: 500 }
        );
    }
}
