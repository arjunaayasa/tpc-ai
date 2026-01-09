import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);

        // Pagination
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const skip = (page - 1) * limit;

        // Verify document exists
        const document = await prisma.document.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!document) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        // Get chunks with pagination
        const [chunks, total] = await Promise.all([
            prisma.regulationChunk.findMany({
                where: { documentId: id },
                orderBy: { orderIndex: 'asc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    pasal: true,
                    ayat: true,
                    huruf: true,
                    chunkType: true,
                    role: true,
                    title: true,
                    parentChunkId: true,
                    legalRefs: true,
                    orderIndex: true,
                    anchorCitation: true,
                    text: true,
                    tokenEstimate: true,
                    createdAt: true,
                },
            }),
            prisma.regulationChunk.count({
                where: { documentId: id },
            }),
        ]);

        return NextResponse.json({
            chunks,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get chunks error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch chunks', details: (error as Error).message },
            { status: 500 }
        );
    }
}
