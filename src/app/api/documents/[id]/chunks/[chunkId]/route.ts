import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string; chunkId: string }>;
}

// PATCH - Update chunk text/title
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: documentId, chunkId } = await params;
        const body = await request.json();
        const { text, title } = body;

        // Verify chunk belongs to document
        const chunk = await prisma.regulationChunk.findFirst({
            where: { id: chunkId, documentId },
        });

        if (!chunk) {
            return NextResponse.json(
                { error: 'Chunk not found' },
                { status: 404 }
            );
        }

        // Update chunk
        const updated = await prisma.regulationChunk.update({
            where: { id: chunkId },
            data: {
                ...(text !== undefined && { text }),
                ...(title !== undefined && { title }),
                ...(text !== undefined && { tokenEstimate: Math.ceil(text.length / 4) }),
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Update chunk error:', error);
        return NextResponse.json(
            { error: 'Failed to update chunk', details: (error as Error).message },
            { status: 500 }
        );
    }
}

// DELETE - Remove chunk
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: documentId, chunkId } = await params;

        // Verify chunk belongs to document
        const chunk = await prisma.regulationChunk.findFirst({
            where: { id: chunkId, documentId },
        });

        if (!chunk) {
            return NextResponse.json(
                { error: 'Chunk not found' },
                { status: 404 }
            );
        }

        // Delete chunk
        await prisma.regulationChunk.delete({
            where: { id: chunkId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete chunk error:', error);
        return NextResponse.json(
            { error: 'Failed to delete chunk', details: (error as Error).message },
            { status: 500 }
        );
    }
}
