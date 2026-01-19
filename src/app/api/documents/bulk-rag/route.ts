import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * Bulk update RAG status for all documents
 * POST /api/documents/bulk-rag
 * Body: { isActiveForRAG: boolean }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (typeof body.isActiveForRAG !== 'boolean') {
            return NextResponse.json(
                { error: 'isActiveForRAG must be a boolean' },
                { status: 400 }
            );
        }

        // Update all documents
        const result = await prisma.document.updateMany({
            data: { isActiveForRAG: body.isActiveForRAG },
        });

        return NextResponse.json({
            success: true,
            updated: result.count,
            message: `${result.count} documents ${body.isActiveForRAG ? 'enabled' : 'disabled'} for RAG`
        });
    } catch (error) {
        console.error('Bulk RAG update error:', error);
        return NextResponse.json(
            { error: 'Failed to update documents', details: (error as Error).message },
            { status: 500 }
        );
    }
}
