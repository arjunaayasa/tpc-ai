import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { embedTexts, EMBEDDING_MODEL, hashText as embedHashText } from '@/lib/embeddings';

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

// POST - Create new chunk
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;
        const body = await request.json();

        // Verify document exists
        const document = await prisma.document.findUnique({
            where: { id },
            select: { id: true, status: true },
        });

        if (!document) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        // Don't allow adding chunks to approved documents
        if (document.status === 'approved') {
            return NextResponse.json(
                { error: 'Cannot add chunks to approved documents' },
                { status: 400 }
            );
        }

        const { title, text, chunkType, anchorCitation, pasal, ayat, huruf: hurufParam } = body;

        if (!text || !text.trim()) {
            return NextResponse.json(
                { error: 'Text is required' },
                { status: 400 }
            );
        }

        // Get max orderIndex
        const maxOrder = await prisma.regulationChunk.findFirst({
            where: { documentId: id },
            orderBy: { orderIndex: 'desc' },
            select: { orderIndex: true },
        });
        const newOrderIndex = (maxOrder?.orderIndex ?? -1) + 1;

        // Token estimate
        const tokenEstimate = Math.ceil(text.length / 4);

        // Create chunk
        const chunk = await prisma.regulationChunk.create({
            data: {
                documentId: id,
                title: title || null,
                text: text.trim(),
                chunkType: chunkType || 'SECTION',
                role: 'UNKNOWN',
                anchorCitation: anchorCitation || `Manual Chunk ${newOrderIndex + 1}`,
                pasal: pasal || null,
                ayat: ayat || null,
                huruf: hurufParam || null,
                orderIndex: newOrderIndex,
                tokenEstimate,
            },
        });

        // Generate embedding for new chunk
        try {
            const embeddings = await embedTexts([text.trim()]);
            if (embeddings.length > 0) {
                await prisma.$executeRaw`
                    INSERT INTO "ChunkEmbedding" (id, "chunkId", "modelName", embedding, "textHash", "createdAt")
                    VALUES (
                        gen_random_uuid(),
                        ${chunk.id},
                        ${EMBEDDING_MODEL},
                        ${embeddings[0]}::vector,
                        ${embedHashText(text.trim())},
                        NOW()
                    )
                `;
            }
        } catch (embedError) {
            console.error('Failed to generate embedding for new chunk:', embedError);
            // Continue anyway, embedding can be regenerated later
        }

        return NextResponse.json({ chunk }, { status: 201 });
    } catch (error) {
        console.error('Create chunk error:', error);
        return NextResponse.json(
            { error: 'Failed to create chunk', details: (error as Error).message },
            { status: 500 }
        );
    }
}
